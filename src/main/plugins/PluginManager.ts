import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import axios from 'axios'
import { getAxiosProxy } from '../../fork/util/Axios'
import {
  FLYENV_PLUGIN_ARCHITECTURES,
  validatePluginCatalog,
  validatePluginManifest,
  type FlyEnvPluginCatalog,
  type FlyEnvPluginI18nText,
  type FlyEnvPluginManifest
} from '@shared/plugin/PluginManifest'
import { verifyLicenseCode } from '@shared/license'

const PLUGIN_STATE_VERSION = 2

const require = createRequire(import.meta.url)
const MAX_PLUGIN_ARCHIVE_BYTES = 250 * 1024 * 1024
const MAX_PLUGIN_UNPACKED_BYTES = 1024 * 1024 * 1024
const MAX_PLUGIN_FILES = 10_000
const sevenZip = require('7zip-min-electron') as {
  list(
    path: string,
    callback: (error: Error | null, result?: Array<{ name?: string; size?: string }>) => void
  ): void
  unpack(path: string, destination: string, callback: (error?: Error | null) => void): void
}

type PluginState = {
  enabled: boolean
  activeVersion?: string
  source?: string
  pendingDelete?: string[]
  installToken?: string
}

type PluginStateFile = {
  version: number
  plugins: Record<string, PluginState>
  sources: string[]
}

export type FlyEnvPluginRecord = {
  manifest: FlyEnvPluginManifest
  rootPath: string
  renderEntry?: string
  forkEntry?: string
  development: boolean
  enabled: boolean
  source?: string
}

export type ForkPluginSnapshot = Record<
  string,
  {
    id: string
    version: string
    module: string
    entry: string
  }
>

export type InstalledPlugin = {
  id: string
  name: string
  version: string
  description?: FlyEnvPluginI18nText
  author?: string
  module: FlyEnvPluginManifest['module']
  enabled: boolean
  source?: string
  development: boolean
}

export type PluginManagerOptions = {
  pluginsRoot?: string
  statePath?: string
  fetchImpl?: typeof fetch
  stopPluginServices?: (moduleId: string) => Promise<{ stopped: true }>
  licenseCheck?: () => Promise<boolean>
  secretProtect?: {
    encrypt(text: string): string
    decrypt(data: string): string
  }
}

export type PluginDiagnostic = {
  id?: string
  path?: string
  message: string
}

function resolveEntry(rootPath: string, entry?: string) {
  if (!entry) return undefined
  const target = resolve(rootPath, entry)
  const rel = relative(rootPath, target)
  if (rel.startsWith('..') || resolve(rootPath, rel) !== target) {
    throw new Error(`Plugin entry escapes plugin directory: ${entry}`)
  }
  return target
}

async function isDirectory(path: string) {
  try {
    return (await fs.stat(path)).isDirectory()
  } catch {
    return false
  }
}

function callbackPromise<T>(fn: (callback: (error: Error | null, result?: T) => void) => void) {
  return new Promise<T>((resolvePromise, reject) =>
    fn((error, result) => (error ? reject(error) : resolvePromise(result as T)))
  )
}

const proxiedFetch: typeof fetch = async (input, init) => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const response = await axios({
    method: 'get',
    url,
    proxy: getAxiosProxy(),
    responseType: 'stream',
    validateStatus: () => true,
    signal: init?.signal ?? undefined
  })
  const rawHeaders: Record<string, unknown> =
    typeof response.headers?.toJSON === 'function'
      ? (response.headers.toJSON() as Record<string, unknown>)
      : (response.headers as unknown as Record<string, unknown>)
  const headers = new Headers()
  for (const [key, value] of Object.entries(rawHeaders ?? {})) {
    if (value === undefined || value === null) continue
    headers.set(key, Array.isArray(value) ? value.join(', ') : String(value))
  }
  return new Response(Readable.toWeb(response.data as Readable) as unknown as BodyInit, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

export class PluginManager {
  private plugins = new Map<string, FlyEnvPluginRecord>()
  private moduleToPlugin = new Map<string, FlyEnvPluginRecord>()
  private state: PluginStateFile = { version: PLUGIN_STATE_VERSION, plugins: {}, sources: [] }
  private readonly rootOverride?: string
  private readonly stateOverride?: string
  private readonly fetchImpl: typeof fetch
  private readonly stopPluginServices?: (moduleId: string) => Promise<{ stopped: true }>
  private readonly licenseCheck: () => Promise<boolean>
  private readonly secretProtect?: { encrypt(text: string): string; decrypt(data: string): string }
  private readonly operations = new Map<string, Promise<unknown>>()
  private operationTail: Promise<void> = Promise.resolve()
  private stateLoaded = false
  private diagnostics: PluginDiagnostic[] = []
  private hasRefreshed = false
  private legacyState = false
  private stateDirty = false

  constructor(options: PluginManagerOptions = {}) {
    this.rootOverride = options.pluginsRoot
    this.stateOverride = options.statePath
    this.fetchImpl = options.fetchImpl ?? proxiedFetch
    this.stopPluginServices = options.stopPluginServices
    this.licenseCheck = options.licenseCheck ?? (() => verifyLicenseCode(global.Server.Licenses))
    this.secretProtect = options.secretProtect
  }

  get pluginsRoot() {
    return this.rootOverride ?? join(dirname(global.Server.BaseDir!), 'plugins')
  }

  get statePath() {
    return this.stateOverride ?? join(dirname(this.pluginsRoot), 'plugins.json')
  }

  private async readState() {
    try {
      const value = JSON.parse(
        await fs.readFile(this.statePath, 'utf8')
      ) as Partial<PluginStateFile>
      // Version 1 records can receive install tokens only after a license check.
      // Keep the legacy version until every active record has been migrated.
      this.legacyState = value.version === 1
      this.state = {
        version: this.legacyState ? 1 : PLUGIN_STATE_VERSION,
        plugins: value.plugins && typeof value.plugins === 'object' ? value.plugins : {},
        sources: Array.isArray(value.sources)
          ? value.sources.filter((item) => typeof item === 'string')
          : []
      }
    } catch {
      this.legacyState = false
      this.state = { version: PLUGIN_STATE_VERSION, plugins: {}, sources: [] }
    }
    this.stateLoaded = true
  }

  private async ensureStateLoaded() {
    if (!this.stateLoaded) await this.readState()
  }

  private async writeState() {
    await fs.mkdir(dirname(this.statePath), { recursive: true })
    const temporary = `${this.statePath}.${randomUUID()}.tmp`
    await fs.writeFile(temporary, JSON.stringify(this.state, null, 2))
    await fs.rename(temporary, this.statePath)
  }

  private async cleanupPendingDeletes() {
    let changed = false
    for (const [id, state] of Object.entries(this.state.plugins)) {
      if (!state.pendingDelete?.length) continue
      const remaining: string[] = []
      for (const path of state.pendingDelete) {
        try {
          await fs.rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 })
        } catch {
          remaining.push(path)
        }
      }
      if (remaining.length) state.pendingDelete = remaining
      else {
        delete state.pendingDelete
        if (!state.activeVersion && !state.source) delete this.state.plugins[id]
      }
      changed = true
    }
    if (changed) await this.writeState()
  }

  getDiagnostics() {
    return [...this.diagnostics]
  }

  private runSerialized<T>(id: string, operation: () => Promise<T>) {
    const existing = this.operations.get(id)
    if (existing) return existing as Promise<T>
    const task = this.operationTail.then(operation).finally(() => {
      if (this.operations.get(id) === task) this.operations.delete(id)
    })
    this.operations.set(id, task)
    this.operationTail = task.then(
      () => undefined,
      () => undefined
    )
    return task
  }

  async refresh() {
    return this.runSerialized('__refresh__', async () => {
      await this.readState()
      return this.refreshLoaded()
    })
  }

  private async refreshLoaded() {
    this.diagnostics = []
    if (!this.hasRefreshed) await this.cleanupPendingDeletes()
    if ((globalThis as any).Server?.DataDirectoryReady === false) {
      this.plugins.clear()
      this.moduleToPlugin.clear()
      this.hasRefreshed = true
      return []
    }
    const records: FlyEnvPluginRecord[] = []
    const developmentPath = process.env.FLYENV_PLUGIN_PATH
    if (developmentPath) {
      records.push(await this.loadPlugin(resolve(developmentPath), true, 'development'))
    } else {
      await fs.mkdir(this.pluginsRoot, { recursive: true })
      const entries = await fs.readdir(this.pluginsRoot, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue
        const rootPath = join(this.pluginsRoot, entry.name)
        try {
          const directManifest = join(rootPath, 'plugin.json')
          if (
            await fs
              .stat(directManifest)
              .then(() => true)
              .catch(() => false)
          ) {
            try {
              records.push(await this.loadPlugin(rootPath, false))
            } catch (error) {
              this.recordDiagnostic(rootPath, error)
            }
            continue
          }
          const versions = await fs.readdir(rootPath, { withFileTypes: true })
          for (const version of versions) {
            if (!version.isDirectory() || version.name.startsWith('.')) continue
            try {
              records.push(await this.loadPlugin(join(rootPath, version.name), false))
            } catch (error) {
              this.recordDiagnostic(join(rootPath, version.name), error)
            }
          }
        } catch (error) {
          this.recordDiagnostic(rootPath, error)
        }
      }
    }

    const selected = new Map<string, FlyEnvPluginRecord>()
    for (const record of records) {
      const state = this.state.plugins[record.manifest.id]
      const current = selected.get(record.manifest.id)
      if (state?.activeVersion && state.activeVersion !== record.manifest.version) {
        const hasActive = records.some(
          (candidate) =>
            candidate.manifest.id === record.manifest.id &&
            candidate.manifest.version === state.activeVersion
        )
        if (hasActive) continue
        if (!current) {
          this.recordDiagnostic(
            record.rootPath,
            new Error(`Active plugin version is unavailable: ${state.activeVersion}`),
            record.manifest.id
          )
        }
      }
      if (
        !current ||
        state?.activeVersion === record.manifest.version ||
        (!state?.activeVersion &&
          record.manifest.version.localeCompare(current.manifest.version, undefined, {
            numeric: true
          }) > 0)
      ) {
        selected.set(record.manifest.id, {
          ...record,
          enabled: record.development ? true : state?.enabled !== false,
          source: record.development ? 'development' : state?.source
        })
      }
    }

    this.plugins.clear()
    this.moduleToPlugin.clear()
    for (const record of selected.values()) {
      if (!record.development) {
        try {
          await this.assertScannedPluginAllowed(record)
        } catch (error) {
          this.recordDiagnostic(record.rootPath, error, record.manifest.id)
          continue
        }
      }
      const moduleId = record.manifest.module.typeFlag
      if (this.plugins.has(record.manifest.id)) {
        this.recordDiagnostic(
          record.rootPath,
          new Error(`Duplicate plugin id: ${record.manifest.id}`),
          record.manifest.id
        )
        continue
      }
      if (this.moduleToPlugin.has(moduleId)) {
        this.recordDiagnostic(
          record.rootPath,
          new Error(`Duplicate plugin module: ${moduleId}`),
          record.manifest.id
        )
        continue
      }
      this.plugins.set(record.manifest.id, record)
      this.moduleToPlugin.set(moduleId, record)
    }
    if (this.stateDirty) {
      if (
        Object.values(this.state.plugins).every((plugin) =>
          plugin.activeVersion ? !!plugin.installToken : true
        )
      ) {
        this.state.version = PLUGIN_STATE_VERSION
        this.legacyState = false
      }
      await this.writeState()
      this.stateDirty = false
    }
    this.hasRefreshed = true
    return this.listInstalled()
  }

  /**
   * Scan-time guard: require a matching local install record, or migrate a
   * version 1 record with an active license. This prevents an ordinary copy
   * of plugin files from activating without a corresponding local record.
   */
  private async assertScannedPluginAllowed(record: FlyEnvPluginRecord) {
    const state = this.state.plugins[record.manifest.id]
    if (!state?.activeVersion) {
      throw new Error(`Plugin was not installed through the plugin manager: ${record.manifest.id}`)
    }
    if (!state.installToken && this.legacyState && !(await this.licenseCheck())) {
      throw new Error(`An active license is required to migrate plugin: ${record.manifest.id}`)
    }
    const manifestRaw = await fs.readFile(join(record.rootPath, 'plugin.json'), 'utf8')
    const token = await this.computeInstallToken(
      record.manifest.id,
      record.manifest.version,
      manifestRaw
    )
    if (state.installToken) {
      if (state.installToken !== token) {
        throw new Error(`Plugin install record mismatch: ${record.manifest.id}`)
      }
      return
    }
    if (this.legacyState) {
      state.installToken = token
      this.stateDirty = true
      return
    }
    throw new Error(`Plugin install record mismatch: ${record.manifest.id}`)
  }

  /**
   * Per-installation random secret used to bind install tokens to this FlyEnv
   * installation. Deliberately not derived from the machine id, which can
   * change. Stored outside both the plugins directory and plugins.json, so
   * copying those to another installation is not enough to forge tokens.
   *
   * When a `secretProtect` implementation is available (Electron safeStorage
   * in the app), the secret is stored encrypted with the OS account keychain:
   * copying even this file to another machine yields ciphertext that cannot
   * be decrypted there, and the scan guard rejects the copied plugins. A
   * missing or unreadable secret never skips token verification.
   */
  private installSecret?: string
  private async getInstallSecret() {
    if (this.installSecret) return this.installSecret
    const secretPath = join(dirname(this.statePath), '.plugin-install-secret')
    let existing = ''
    try {
      existing = (await fs.readFile(secretPath, 'utf8')).trim()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (existing.startsWith('enc:')) {
      if (!this.secretProtect) {
        throw new Error('Plugin install secret cannot be decrypted on this installation')
      }
      try {
        const decrypted = this.secretProtect.decrypt(existing.slice(4))
        this.installSecret = decrypted
        return decrypted
      } catch (error) {
        throw new Error(
          `Plugin install secret cannot be decrypted on this installation: ${(error as Error)?.message ?? error}`
        )
      }
    }
    if (existing) {
      this.installSecret = existing
      return existing
    }
    const created = randomUUID()
    await fs.mkdir(dirname(secretPath), { recursive: true })
    const stored = this.secretProtect ? `enc:${this.secretProtect.encrypt(created)}` : created
    await fs.writeFile(secretPath, stored, { mode: 0o600, flag: 'wx' })
    this.installSecret = created
    return created
  }

  private async computeInstallToken(id: string, version: string, manifestRaw: string) {
    const secret = await this.getInstallSecret()
    return createHash('sha256').update(`${secret}:${id}:${version}:${manifestRaw}`).digest('hex')
  }

  private recordDiagnostic(pluginPath: string, error: unknown, id?: string) {
    const message = error instanceof Error ? error.message : String(error)
    this.diagnostics.push({ id, path: pluginPath, message })
    console.warn('[PluginManager] ignore invalid plugin', pluginPath, message)
  }

  listInstalled(): InstalledPlugin[] {
    return [...this.plugins.values()].map((item) => ({
      id: item.manifest.id,
      name: item.manifest.name,
      version: item.manifest.version,
      description: item.manifest.description,
      author: item.manifest.author,
      module: item.manifest.module,
      enabled: item.enabled,
      source: item.source,
      development: item.development
    }))
  }

  list() {
    return this.listInstalled()
  }

  getForkSnapshot(): ForkPluginSnapshot {
    const result: ForkPluginSnapshot = {}
    for (const record of this.plugins.values()) {
      if (!record.enabled || !record.forkEntry) continue
      result[record.manifest.module.typeFlag] = {
        id: record.manifest.id,
        version: record.manifest.version,
        module: record.manifest.module.typeFlag,
        entry: record.forkEntry
      }
    }
    return result
  }

  async getRendererPlugins() {
    const result: Array<{
      id: string
      version: string
      module: FlyEnvPluginManifest['module']
      code: string
      css?: string
    }> = []
    for (const record of this.plugins.values()) {
      if (!record.enabled || !record.renderEntry) continue
      const code = await fs.readFile(record.renderEntry, 'utf8')
      const cssPath = join(dirname(record.renderEntry), 'style.css')
      let css: string | undefined
      try {
        css = await fs.readFile(cssPath, 'utf8')
      } catch {}
      result.push({
        id: record.manifest.id,
        version: record.manifest.version,
        module: record.manifest.module,
        code,
        css
      })
    }
    return result
  }

  setEnabled(id: string, enabled: boolean) {
    return this.runSerialized(id, async () => {
      if (!this.plugins.has(id)) throw new Error(`Plugin not installed: ${id}`)
      if (!enabled) {
        await this.stopPluginServices?.(this.plugins.get(id)!.manifest.module.typeFlag)
      }
      const state = this.state.plugins[id] ?? { enabled: true }
      state.enabled = enabled
      this.state.plugins[id] = state
      await this.writeState()
      await this.refreshLoaded()
      return this.plugins.get(id)
    })
  }

  async listSources() {
    await this.ensureStateLoaded()
    return this.state.sources.map((url) => ({ url, official: false }))
  }

  async addSource(url: string) {
    this.assertSourceUrl(url)
    return this.runSerialized(`source:add:${url}`, async () => {
      await this.ensureStateLoaded()
      if (!this.state.sources.includes(url)) this.state.sources.push(url)
      await this.writeState()
      return this.listSources()
    })
  }

  async removeSource(url: string) {
    return this.runSerialized(`source:remove:${url}`, async () => {
      await this.ensureStateLoaded()
      this.state.sources = this.state.sources.filter((item) => item !== url)
      await this.writeState()
      return this.listSources()
    })
  }

  async listCatalog() {
    const catalogs: Array<{ catalog: FlyEnvPluginCatalog; source: string; official: boolean }> = []
    const officialUrl =
      process.env.FLYENV_PLUGIN_REGISTRY_URL ?? 'https://oss.macphpstudy.com/plugins/registry.json'
    const sources = [officialUrl, ...(await this.listSources()).map((item) => item.url)]
    for (const source of sources) {
      try {
        const response = await this.fetchImpl(source, { signal: AbortSignal.timeout(60_000) })
        if (!response.ok) throw new Error(`Registry request failed: ${response.status}`)
        catalogs.push({
          catalog: validatePluginCatalog(await response.json()),
          source,
          official: source === officialUrl
        })
      } catch (error) {
        console.warn('[PluginManager] registry unavailable', source, error)
      }
    }
    const installed = new Map(this.listInstalled().map((item) => [item.id, item]))
    const platform = this.currentPlatform()
    const seen = new Set<string>()
    return catalogs.flatMap(({ catalog, source, official }) =>
      catalog.plugins.flatMap((item) => {
        if (item.platforms?.length && !item.platforms.includes(platform)) return []
        if (seen.has(item.id)) return []
        seen.add(item.id)
        const current = installed.get(item.id)
        return [
          {
            ...item,
            source,
            official,
            installed: current?.version ?? null,
            enabled: current?.enabled ?? false
          }
        ]
      })
    )
  }

  install(input: { id?: string; version?: string; url: string; sha256?: string; source?: string }) {
    return this.runSerialized(input.id ?? input.url, () => this.installInternal(input))
  }

  private async installInternal(input: {
    id?: string
    version?: string
    url: string
    sha256?: string
    source?: string
  }) {
    this.assertSourceUrl(input.url)
    if (!(await this.licenseCheck())) {
      throw new Error('An active license is required to install or update plugins')
    }
    if (input.source && !input.sha256) {
      throw new Error('Plugin catalog installs require a SHA-256 checksum')
    }
    await this.ensureStateLoaded()
    await fs.mkdir(this.pluginsRoot, { recursive: true })
    const temporary = join(tmpdir(), `flyenv-plugin-${randomUUID()}.flyenv-plugin`)
    const extraction = join(this.pluginsRoot, `.staging-${randomUUID()}`)
    try {
      const response = await this.fetchImpl(input.url, { signal: AbortSignal.timeout(120_000) })
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        throw new Error(`Plugin download failed: ${response.status}`)
      }
      const contentLength = Number(response.headers.get('content-length') ?? 0)
      if (contentLength > MAX_PLUGIN_ARCHIVE_BYTES) {
        await response.body?.cancel().catch(() => {})
        throw new Error('Plugin archive is too large')
      }
      if (!response.body) throw new Error('Plugin download has no response body')
      let archive: Awaited<ReturnType<typeof fs.open>>
      try {
        archive = await fs.open(temporary, 'wx')
      } catch (error) {
        await response.body.cancel().catch(() => {})
        throw error
      }
      const reader = response.body.getReader()
      const digest = createHash('sha256')
      let downloadedBytes = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          downloadedBytes += value.byteLength
          if (downloadedBytes > MAX_PLUGIN_ARCHIVE_BYTES) {
            throw new Error('Plugin archive is too large')
          }
          digest.update(value)
          let offset = 0
          while (offset < value.byteLength) {
            const { bytesWritten } = await archive.write(value, offset, value.byteLength - offset)
            if (bytesWritten === 0) throw new Error('Plugin download could not be written')
            offset += bytesWritten
          }
        }
      } finally {
        await reader.cancel().catch(() => {})
        await archive.close()
      }
      if (input.sha256 && digest.digest('hex').toLowerCase() !== input.sha256.toLowerCase()) {
        throw new Error('Plugin checksum verification failed')
      }
      const files = await callbackPromise<Array<{ name?: string; size?: string }>>((callback) =>
        sevenZip.list(temporary, callback)
      )
      if (!files?.length || files.length > MAX_PLUGIN_FILES) {
        throw new Error('Plugin archive contains too many files')
      }
      let unpackedBytes = 0
      for (const item of files ?? []) {
        const name = (item.name ?? '').replaceAll('\\', '/').replace(/\/+/g, '/')
        if (name.startsWith('/') || /^[A-Za-z]:\//.test(name) || name.split('/').includes('..'))
          throw new Error('Plugin archive contains an unsafe path')
        const size = Number(item.size ?? 0)
        if (!Number.isSafeInteger(size) || size < 0) {
          throw new Error('Plugin archive contains an invalid file size')
        }
        unpackedBytes += size
        if (unpackedBytes > MAX_PLUGIN_UNPACKED_BYTES) {
          throw new Error('Plugin archive expands beyond the allowed size')
        }
      }
      await fs.mkdir(extraction, { recursive: true })
      await callbackPromise<void>((callback) => sevenZip.unpack(temporary, extraction, callback))
      await this.validateExtractedTree(extraction)
      let packageRoot = extraction
      for (
        let depth = 0;
        depth < 2 &&
        !(await fs
          .stat(join(packageRoot, 'plugin.json'))
          .then(() => true)
          .catch(() => false));
        depth += 1
      ) {
        const children = (await fs.readdir(packageRoot, { withFileTypes: true })).filter((item) =>
          item.isDirectory()
        )
        if (children.length !== 1)
          throw new Error('Plugin archive must contain plugin.json at its root')
        packageRoot = join(packageRoot, children[0].name)
      }
      const manifestRaw = await fs.readFile(join(packageRoot, 'plugin.json'), 'utf8')
      const manifest = validatePluginManifest(JSON.parse(manifestRaw))
      this.assertManifestCompatibility(manifest)
      if (input.id && input.id !== manifest.id)
        throw new Error('Plugin id does not match the registry entry')
      if (input.version && input.version !== manifest.version)
        throw new Error('Plugin version does not match the registry entry')
      await this.validatePackageRoot(packageRoot, manifest)
      const installed = this.plugins.get(manifest.id)
      if (installed) await this.stopPluginServices?.(manifest.module.typeFlag)
      const targetRoot = join(this.pluginsRoot, manifest.id, manifest.version)
      await fs.mkdir(dirname(targetRoot), { recursive: true })
      const previousState = this.state.plugins[manifest.id]
        ? structuredClone(this.state.plugins[manifest.id])
        : undefined
      const backupRoot = `${targetRoot}.backup-${randomUUID()}`
      const targetExists = await fs
        .stat(targetRoot)
        .then(() => true)
        .catch(() => false)
      try {
        if (targetExists) await fs.rename(targetRoot, backupRoot)
        await fs.rename(packageRoot, targetRoot)
        this.state.plugins[manifest.id] = {
          enabled: previousState?.enabled !== false,
          activeVersion: manifest.version,
          source: input.source ?? previousState?.source,
          pendingDelete: previousState?.pendingDelete,
          installToken: await this.computeInstallToken(manifest.id, manifest.version, manifestRaw)
        }
        await this.writeState()
        await this.refreshLoaded()
        await this.scheduleVersionCleanup(
          manifest.id,
          manifest.version,
          previousState?.activeVersion
        )
        if (targetExists) await fs.rm(backupRoot, { recursive: true, force: true })
        return this.listInstalled().find((item) => item.id === manifest.id)!
      } catch (error) {
        await fs.rm(targetRoot, { recursive: true, force: true }).catch(() => {})
        if (targetExists) await fs.rename(backupRoot, targetRoot).catch(() => {})
        if (previousState) this.state.plugins[manifest.id] = previousState
        else delete this.state.plugins[manifest.id]
        await this.writeState().catch(() => {})
        await this.refreshLoaded().catch(() => {})
        throw error
      } finally {
        await fs.rm(backupRoot, { recursive: true, force: true }).catch(() => {})
      }
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {})
      await fs.rm(extraction, { recursive: true, force: true }).catch(() => {})
    }
  }

  update(id: string) {
    return this.runSerialized(id, async () => {
      const item = (await this.listCatalog()).find((candidate) => candidate.id === id)
      if (!item) throw new Error(`No update information found for plugin: ${id}`)
      return this.installInternal({
        id: item.id,
        version: item.version,
        url: item.artifact.url,
        sha256: item.artifact.sha256,
        source: item.official ? 'official' : item.source
      })
    })
  }

  uninstall(id: string) {
    return this.runSerialized(id, async () => {
      if (!this.plugins.has(id)) throw new Error(`Plugin not installed: ${id}`)
      await this.stopPluginServices?.(this.plugins.get(id)!.manifest.module.typeFlag)
      const pluginRoot = join(this.pluginsRoot, id)
      let pendingDelete: string | undefined
      try {
        await fs.rm(pluginRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
      } catch (error) {
        const pending = `${pluginRoot}.pending-delete-${Date.now()}`
        try {
          await fs.rename(pluginRoot, pending)
          pendingDelete = pending
        } catch {
          throw new Error(`Plugin files are in use and could not be removed: ${error}`)
        }
      }
      if (pendingDelete) this.state.plugins[id] = { enabled: false, pendingDelete: [pendingDelete] }
      else delete this.state.plugins[id]
      await this.writeState()
      await this.refreshLoaded()
      return true
    })
  }

  private async validateExtractedTree(rootPath: string) {
    const pending = [rootPath]
    let files = 0
    let bytes = 0
    while (pending.length) {
      const directory = pending.pop()!
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const entryPath = join(directory, entry.name)
        const stat = await fs.lstat(entryPath)
        if (stat.isSymbolicLink()) {
          throw new Error('Plugin archive contains a symbolic link')
        }
        if (stat.isDirectory()) {
          pending.push(entryPath)
          continue
        }
        if (!stat.isFile()) throw new Error('Plugin archive contains an unsupported file')
        files += 1
        bytes += stat.size
        if (files > MAX_PLUGIN_FILES || bytes > MAX_PLUGIN_UNPACKED_BYTES) {
          throw new Error('Plugin archive expands beyond the allowed size')
        }
      }
    }
  }

  private async loadPlugin(
    rootPath: string,
    development: boolean,
    source?: string
  ): Promise<FlyEnvPluginRecord> {
    if (!(await isDirectory(rootPath))) throw new Error(`Plugin directory not found: ${rootPath}`)
    const manifest = validatePluginManifest(
      JSON.parse(await fs.readFile(join(rootPath, 'plugin.json'), 'utf8'))
    )
    this.assertManifestCompatibility(manifest)
    await this.validatePackageRoot(rootPath, manifest)
    return {
      manifest,
      rootPath,
      renderEntry: resolveEntry(rootPath, manifest.entry.render),
      forkEntry: resolveEntry(rootPath, manifest.entry.fork),
      development,
      enabled: development,
      source
    }
  }

  private async validatePackageRoot(rootPath: string, manifest: FlyEnvPluginManifest) {
    for (const entry of [manifest.entry.render, manifest.entry.fork]) {
      if (!entry) continue
      const entryPath = resolveEntry(rootPath, entry)
      if (!entryPath) continue
      const stat = await fs.lstat(entryPath).catch(() => undefined)
      if (!stat?.isFile()) throw new Error(`Plugin entry file is missing: ${entry}`)
      const realRoot = await fs.realpath(rootPath)
      const realEntry = await fs.realpath(entryPath)
      const rel = relative(realRoot, realEntry)
      if (rel.startsWith('..') || resolve(realRoot, rel) !== realEntry) {
        throw new Error(`Plugin entry escapes plugin directory: ${entry}`)
      }
    }
  }

  private async scheduleVersionCleanup(
    id: string,
    activeVersion: string,
    previousVersion?: string
  ) {
    const versionsRoot = join(this.pluginsRoot, id)
    const versions = await fs.readdir(versionsRoot, { withFileTypes: true }).catch(() => [])
    const pending = this.state.plugins[id]?.pendingDelete ?? []
    for (const version of versions) {
      if (!version.isDirectory() || version.name.startsWith('.')) continue
      if (version.name === activeVersion || version.name === previousVersion) continue
      const versionPath = join(versionsRoot, version.name)
      if (!pending.includes(versionPath)) pending.push(versionPath)
    }
    if (pending.length) {
      this.state.plugins[id] = { ...this.state.plugins[id], pendingDelete: pending }
      await this.writeState()
    }
  }

  private assertSourceUrl(url: string) {
    if (!/^https?:\/\//i.test(url)) throw new Error('Plugin sources must use http or https')
  }

  private currentPlatform(): 'macOS' | 'Windows' | 'Linux' {
    if (process.platform === 'win32') return 'Windows'
    if (process.platform === 'darwin') return 'macOS'
    return 'Linux'
  }

  private currentArchitecture(): (typeof FLYENV_PLUGIN_ARCHITECTURES)[number] {
    if (FLYENV_PLUGIN_ARCHITECTURES.includes(process.arch as never)) {
      return process.arch as (typeof FLYENV_PLUGIN_ARCHITECTURES)[number]
    }
    return 'x64'
  }

  private assertManifestCompatibility(manifest: FlyEnvPluginManifest) {
    const platform = this.currentPlatform()
    if (manifest.module.platform?.length && !manifest.module.platform.includes(platform)) {
      throw new Error(`Plugin ${manifest.id} is not compatible with ${platform}`)
    }
    const architecture = this.currentArchitecture()
    if (manifest.architecture?.length && !manifest.architecture.includes(architecture)) {
      throw new Error(`Plugin ${manifest.id} is not compatible with ${architecture}`)
    }
  }
}

export default PluginManager
