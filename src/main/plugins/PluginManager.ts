import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import {
  FLYENV_PLUGIN_ARCHITECTURES,
  validatePluginCatalog,
  validatePluginManifest,
  type FlyEnvPluginCatalog,
  type FlyEnvPluginManifest
} from '@shared/plugin/PluginManifest'

const require = createRequire(import.meta.url)
const MAX_PLUGIN_ARCHIVE_BYTES = 250 * 1024 * 1024
const sevenZip = require('7zip-min-electron') as {
  list(
    path: string,
    callback: (error: Error | null, result?: Array<{ name?: string }>) => void
  ): void
  unpack(path: string, destination: string, callback: (error?: Error | null) => void): void
}

type PluginState = {
  enabled: boolean
  activeVersion?: string
  source?: string
  pendingDelete?: string[]
}

type PluginStateFile = {
  version: 1
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
  description?: string
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

export class PluginManager {
  private plugins = new Map<string, FlyEnvPluginRecord>()
  private moduleToPlugin = new Map<string, FlyEnvPluginRecord>()
  private state: PluginStateFile = { version: 1, plugins: {}, sources: [] }
  private readonly rootOverride?: string
  private readonly stateOverride?: string
  private readonly fetchImpl: typeof fetch
  private readonly stopPluginServices?: (moduleId: string) => Promise<{ stopped: true }>
  private readonly operations = new Map<string, Promise<unknown>>()
  private diagnostics: PluginDiagnostic[] = []
  private hasRefreshed = false

  constructor(options: PluginManagerOptions = {}) {
    this.rootOverride = options.pluginsRoot
    this.stateOverride = options.statePath
    this.fetchImpl = options.fetchImpl ?? fetch
    this.stopPluginServices = options.stopPluginServices
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
      this.state = {
        version: 1,
        plugins: value.plugins && typeof value.plugins === 'object' ? value.plugins : {},
        sources: Array.isArray(value.sources)
          ? value.sources.filter((item) => typeof item === 'string')
          : []
      }
    } catch {
      this.state = { version: 1, plugins: {}, sources: [] }
    }
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
    const task = operation().finally(() => {
      if (this.operations.get(id) === task) this.operations.delete(id)
    })
    this.operations.set(id, task)
    return task
  }

  async refresh() {
    await this.readState()
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
    this.hasRefreshed = true
    return this.listInstalled()
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
      await this.refresh()
      return this.plugins.get(id)
    })
  }

  async listSources() {
    await this.readState()
    return this.state.sources.map((url) => ({ url, official: false }))
  }

  async addSource(url: string) {
    this.assertSourceUrl(url)
    await this.readState()
    if (!this.state.sources.includes(url)) this.state.sources.push(url)
    await this.writeState()
    return this.listSources()
  }

  async removeSource(url: string) {
    await this.readState()
    this.state.sources = this.state.sources.filter((item) => item !== url)
    await this.writeState()
    return this.listSources()
  }

  async listCatalog() {
    const catalogs: Array<{ catalog: FlyEnvPluginCatalog; source: string; official: boolean }> = []
    const officialUrl =
      process.env.FLYENV_PLUGIN_REGISTRY_URL ??
      'https://raw.githubusercontent.com/xpf0000/FlyEnv/master/plugins/registry.json'
    const sources = [officialUrl, ...(await this.listSources()).map((item) => item.url)]
    for (const source of sources) {
      try {
        const response = await this.fetchImpl(source, { signal: AbortSignal.timeout(10_000) })
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
    if (input.source && !input.sha256) {
      throw new Error('Plugin catalog installs require a SHA-256 checksum')
    }
    await this.readState()
    await fs.mkdir(this.pluginsRoot, { recursive: true })
    const response = await this.fetchImpl(input.url, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`Plugin download failed: ${response.status}`)
    const contentLength = Number(response.headers.get('content-length') ?? 0)
    if (contentLength > MAX_PLUGIN_ARCHIVE_BYTES) throw new Error('Plugin archive is too large')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.byteLength > MAX_PLUGIN_ARCHIVE_BYTES) throw new Error('Plugin archive is too large')
    if (input.sha256) {
      const actual = createHash('sha256').update(bytes).digest('hex')
      if (actual.toLowerCase() !== input.sha256.toLowerCase())
        throw new Error('Plugin checksum verification failed')
    }
    const temporary = join(tmpdir(), `flyenv-plugin-${randomUUID()}.flyenv-plugin`)
    const extraction = join(this.pluginsRoot, `.staging-${randomUUID()}`)
    await fs.writeFile(temporary, bytes)
    try {
      const files = await callbackPromise<Array<{ name?: string }>>((callback) =>
        sevenZip.list(temporary, callback)
      )
      for (const item of files ?? []) {
        const name = (item.name ?? '').replaceAll('\\', '/').replace(/\/+/g, '/')
        if (name.startsWith('/') || name.split('/').includes('..'))
          throw new Error('Plugin archive contains an unsafe path')
      }
      await fs.mkdir(extraction, { recursive: true })
      await callbackPromise<void>((callback) => sevenZip.unpack(temporary, extraction, callback))
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
      const manifest = validatePluginManifest(
        JSON.parse(await fs.readFile(join(packageRoot, 'plugin.json'), 'utf8'))
      )
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
          pendingDelete: previousState?.pendingDelete
        }
        await this.writeState()
        await this.refresh()
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
        await this.refresh().catch(() => {})
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
      await this.refresh()
      return true
    })
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
