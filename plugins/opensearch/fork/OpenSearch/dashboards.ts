import { createHash } from 'node:crypto'
import { closeSync, existsSync, openSync, readFileSync } from 'node:fs'
import { access, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { setTimeout as delay } from 'node:timers/promises'
import * as https from 'node:https'
import axios from 'axios'
import type { SoftInstalled } from '@shared/app'
import { Base } from '@fork/module/Base'
import { unpack } from '@fork/util/Zip'
import { getAxiosProxy } from '@fork/util/Axios'
import { findLoopbackPort } from '@shared/LoopbackPort'
import { isMacOS, isWindows, waitTime } from '@shared/utils'
import { currentServiceStopContext, withServiceStopContext } from '@shared/ServiceStopContext'
import { fetchLoopbackListeningPids, type PItem } from '@shared/Process'
import { fetchStopProcessListLocal, StopProcessListFetch } from '@shared/StopProcessList'
import EnvSync from '@shared/EnvSync'
import { zipUnpack } from '@fork/Fn'
import YAML from 'yamljs'
import { OpenSearchT, type OpenSearchLangKey } from '../lang'
import { resolveConfDir } from './homebrew'
import { OpenSearchDashboardsCoordination } from './coordination'

const START_PORT = 5601
const PORT_SCAN = 80
const READY_ATTEMPTS = 60
const READY_DELAY = 500
const DOWNLOAD_TIMEOUT = 240_000
const DASHBOARD_ROOT = 'opensearch-dashboards'
const message = (key: OpenSearchLangKey, args?: Record<string, string | number>) =>
  OpenSearchT(key, args)

export type OpenSearchDashboardsPaths = {
  root: string
  install: string
  staging: string
  archive: string
  instance: string
  entry: string
  node: string
  config: string
  data: string
  logs: string
  pid: string
  output: string
  error: string
  metadata: string
}

export type OpenSearchDashboardsMetadata = {
  version: string
  backendBin: string
  backendPath: string
  backendPid: string
  entry: string
  nodeBin: string
  configPath: string
  dataPath: string
  logPath: string
  pidPath: string
  port: number
}

export type DashboardsOpenResult = {
  url: string
  'APP-Service-Start-PID': string
  'APP-Service-Start-Item': SoftInstalled & { dashboard: OpenSearchDashboardsMetadata }
}

export type OpenSearchBackendConfig = { port: number; tls: boolean }
type Platform = 'windows' | 'linux' | 'macos'
type Arch = 'x64' | 'arm64'

export const dashboardsArtifactUrl = (
  version: string,
  platform: 'windows' | 'linux',
  arch: Arch
) => {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(message('dashboardsVersionInvalid'))
  if (platform === 'windows' && arch !== 'x64')
    throw new Error(message('dashboardsUnsupportedPlatform'))
  const suffix = platform === 'windows' ? 'windows-x64.zip' : `linux-${arch}.tar.gz`
  return `https://artifacts.opensearch.org/releases/bundle/opensearch-dashboards/${version}/opensearch-dashboards-${version}-${suffix}`
}

const yamlValue = (content: string, key: string): string | undefined => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const value = content.match(new RegExp(`^\\s*${escaped}:\\s*(.*?)\\s*(?:#.*)?$`, 'm'))?.[1]
  return value?.replace(/^['"]|['"]$/g, '').trim()
}

export const parseOpenSearchBackendConfig = (content: string): OpenSearchBackendConfig => {
  let config: any
  try {
    config = YAML.parse(content) ?? {}
  } catch {
    throw new Error(message('dashboardsBackendPortInvalid'))
  }
  const securityDisabled =
    config?.plugins?.security?.disabled === true || config?.['plugins.security.disabled'] === true
  const tls =
    !securityDisabled &&
    (config?.plugins?.security?.ssl?.http?.enabled === true ||
      config?.['plugins.security.ssl.http.enabled'] === true)
  const rawPort = config?.http?.port ?? config?.['http.port']
  const portText = `${rawPort ?? 9200}`
  const port = Number(portText.split('-')[0])
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(message('dashboardsBackendPortInvalid'))
  }
  return { port, tls }
}

export const validateOpenSearchBackendResponse = (
  status: number,
  body: unknown,
  expectedVersion: string
): string => {
  if (status === 401 || status === 403) throw new Error(message('dashboardsAuthUnsupported'))
  if (status !== 200) throw new Error(message('dashboardsBackendUnavailable', { status }))
  const version = (body as { version?: { number?: unknown } } | null)?.version?.number
  if (typeof version !== 'string')
    throw new Error(message('dashboardsBackendUnavailable', { status }))
  if (version !== expectedVersion)
    throw new Error(
      message('dashboardsVersionMismatch', { expected: expectedVersion, actual: version })
    )
  return version
}

const backendInstanceId = (backend: SoftInstalled) =>
  createHash('sha256')
    .update(`${backend.version}\0${resolve(backend.path)}\0${resolve(backend.bin)}`)
    .digest('hex')
    .slice(0, 20)

export const dashboardsPaths = (
  baseDir: string,
  backend: SoftInstalled
): OpenSearchDashboardsPaths => {
  if (!/^\d+\.\d+\.\d+$/.test(backend.version ?? ''))
    throw new Error(message('dashboardsVersionInvalid'))
  const root = join(baseDir, DASHBOARD_ROOT)
  const install = join(root, 'versions', `v${backend.version}`)
  const instance = join(root, 'instances', backendInstanceId(backend))
  const windows = isWindows()
  const entry = join(instance, 'launch.cjs')
  return {
    root,
    install,
    staging: join(
      root,
      'staging',
      `v${backend.version}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    ),
    archive: join(
      root,
      'cache',
      `opensearch-dashboards-${backend.version}-${windows ? 'windows-x64.zip' : 'linux.tar.gz'}`
    ),
    instance,
    entry,
    node: '',
    config: join(instance, 'opensearch_dashboards.yml'),
    data: join(instance, 'data'),
    logs: join(instance, 'logs'),
    pid: join(instance, 'dashboards.pid'),
    metadata: join(instance, 'instance.json'),
    output: join(instance, 'start.out.log'),
    error: join(instance, 'start.error.log')
  }
}

export const isOpenSearchDashboardsItem = (
  item: unknown
): item is SoftInstalled & { dashboard: OpenSearchDashboardsMetadata } => {
  const candidate = item as
    (SoftInstalled & { dashboard?: Partial<OpenSearchDashboardsMetadata> }) | null
  return (
    !!candidate &&
    candidate.typeFlag === 'opensearch' &&
    !!candidate.dashboard &&
    /^\d+\.\d+\.\d+$/.test(candidate.dashboard.version ?? '') &&
    typeof candidate.dashboard.backendBin === 'string' &&
    typeof candidate.dashboard.backendPath === 'string' &&
    typeof candidate.dashboard.configPath === 'string' &&
    typeof candidate.dashboard.pidPath === 'string'
  )
}

type BackendProbe = { version: string; port: number }
export type OpenSearchDashboardsRuntimeDependencies = {
  baseDir: () => string
  platform: () => Platform
  arch: () => Arch
  probeBackend: (
    backend: SoftInstalled,
    signal?: AbortSignal,
    on?: (...args: any[]) => void
  ) => Promise<BackendProbe>
  install: (
    version: string,
    paths: OpenSearchDashboardsPaths,
    signal: AbortSignal,
    on: (...args: any[]) => void
  ) => Promise<string>
  findPort: (start: number, count: number, max: number) => Promise<number>
  start: (
    node: string,
    entry: string,
    config: string,
    paths: OpenSearchDashboardsPaths,
    port: number
  ) => Promise<string>
  ready: (
    url: string,
    pid: string,
    paths: OpenSearchDashboardsPaths,
    signal: AbortSignal,
    on: (...args: any[]) => void
  ) => Promise<void>
  checkReady: (
    url: string,
    pid: string,
    paths: OpenSearchDashboardsPaths,
    expectedVersion: string
  ) => Promise<boolean>
  stopOwned: (
    item: SoftInstalled & { dashboard: OpenSearchDashboardsMetadata },
    owner?: OpenSearchDashboardsPanel
  ) => Promise<string[]>
  processes: () => Promise<PItem[]>
}

const toPlatform = (): Platform => (isWindows() ? 'windows' : isMacOS() ? 'macos' : 'linux')
const toArch = (): Arch => (global.Server.Arch === 'x86_64' ? 'x64' : 'arm64')

const defaultProbeBackend = async (
  backend: SoftInstalled,
  signal?: AbortSignal,
  on?: (...args: any[]) => void
): Promise<BackendProbe> => {
  const yaml = readFileSync(join(resolveConfDir(backend.path), 'opensearch.yml'), 'utf8')
  const config = parseOpenSearchBackendConfig(yaml)
  if (config.tls) throw new Error(message('dashboardsTlsUnsupported'))
  const url = `http://127.0.0.1:${config.port}/`
  const deadline = Date.now() + 60_000
  let lastError = ''
  let checkedTls = false
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error(message('dashboardsOpenCancelled'))
    on?.({ 'APP-On-Progress': { stage: 'backend' } })
    let response
    try {
      response = await axios.get(url, {
        timeout: Math.min(2500, deadline - Date.now()),
        proxy: false,
        signal,
        validateStatus: () => true
      })
    } catch (error: any) {
      if (signal?.aborted) throw new Error(message('dashboardsOpenCancelled'))
      lastError = error?.code ?? error?.message ?? 'network error'
      if (!checkedTls) {
        checkedTls = true
        const secure = await axios
          .get(`https://127.0.0.1:${config.port}/`, {
            timeout: 1800,
            proxy: false,
            signal,
            validateStatus: () => true,
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
          })
          .catch(() => undefined)
        if (signal?.aborted) throw new Error(message('dashboardsOpenCancelled'))
        if (secure && [200, 401, 403].includes(secure.status))
          throw new Error(message('dashboardsTlsUnsupported'))
      }
      try {
        await delay(Math.max(0, Math.min(500, deadline - Date.now())), undefined, { signal })
      } catch (error) {
        if (signal?.aborted) throw new Error(message('dashboardsOpenCancelled'))
        throw error
      }
      continue
    }
    return {
      version: validateOpenSearchBackendResponse(
        response.status,
        response.data,
        backend.version ?? ''
      ),
      port: config.port
    }
  }
  throw new Error(message('dashboardsBackendConnectFailed', { url, error: lastError }))
}

const downloadAndInstall = async (
  version: string,
  paths: OpenSearchDashboardsPaths,
  signal: AbortSignal,
  on: (...args: any[]) => void
): Promise<string> => {
  const platform = toPlatform()
  if (platform === 'macos') return installHomebrewDashboards(version, paths, signal, on)
  const url = dashboardsArtifactUrl(version, platform, toArch())
  await mkdir(dirname(paths.archive), { recursive: true })
  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: DOWNLOAD_TIMEOUT,
    proxy: getAxiosProxy(),
    signal
  })
  const total = Number(response.headers['content-length']) || undefined
  let downloaded = 0
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      downloaded += chunk.length
      on({ 'APP-On-Progress': { stage: 'downloading', downloaded, total } })
      callback(null, chunk)
    }
  })
  on({ 'APP-On-Progress': { stage: 'downloading', downloaded: 0, total } })
  await pipeline(response.data, meter, (await import('node:fs')).createWriteStream(paths.archive), {
    signal
  })
  await rm(paths.staging, { recursive: true, force: true })
  await mkdir(paths.staging, { recursive: true })
  on({ 'APP-On-Progress': { stage: 'extracting', version } })
  const extractHeartbeat = setInterval(
    () => on({ 'APP-On-Progress': { stage: 'extracting', version } }),
    10_000
  )
  try {
    if (platform === 'windows') await zipUnpack(paths.archive, paths.staging)
    else await unpack(paths.archive, paths.staging)
    if (signal.aborted) throw new Error(message('dashboardsOpenCancelled'))
  } finally {
    clearInterval(extractHeartbeat)
  }
  const contents = await readdir(paths.staging, { withFileTypes: true })
  const packageRoot = contents.find((item) => item.isDirectory())
  const extracted = packageRoot ? join(paths.staging, packageRoot.name) : paths.staging
  const required = join(extracted, 'src', 'cli', 'dist.js')
  if (!existsSync(required)) throw new Error(message('dashboardsArchiveInvalid'))
  const packageData = JSON.parse(await readFile(join(extracted, 'package.json'), 'utf8'))
  if (packageData.version !== version)
    throw new Error(
      message('dashboardsVersionMismatch', {
        expected: version,
        actual: packageData.version ?? 'unknown'
      })
    )
  const pluginsRoot = join(extracted, 'plugins')
  let pluginEntries: import('node:fs').Dirent<string>[]
  try {
    pluginEntries = await readdir(pluginsRoot, { withFileTypes: true, encoding: 'utf8' })
  } catch (error: any) {
    if (error?.code === 'ENOENT') pluginEntries = []
    else throw error
  }
  for (const plugin of pluginEntries) {
    if (!plugin.isDirectory()) continue
    const pluginDir = join(pluginsRoot, plugin.name)
    let manifest: any
    for (const manifestName of ['opensearch_dashboards.json', 'plugin.json']) {
      try {
        manifest = JSON.parse(await readFile(join(pluginDir, manifestName), 'utf8'))
        break
      } catch (error: any) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
    if (manifest?.id === 'securityDashboards') await rm(pluginDir, { recursive: true, force: true })
  }
  await mkdir(dirname(paths.install), { recursive: true })
  const replacement = `${paths.install}.new-${Date.now()}`
  await rm(replacement, { recursive: true, force: true })
  await rename(extracted, replacement)
  const previous = `${paths.install}.previous-${Date.now()}`
  const hadInstall = await access(paths.install).then(
    () => true,
    () => false
  )
  if (hadInstall) await rename(paths.install, previous)
  try {
    await rename(replacement, paths.install)
  } catch (error) {
    if (hadInstall) await rename(previous, paths.install).catch(() => {})
    throw error
  }
  if (hadInstall) await rm(previous, { recursive: true, force: true }).catch(() => {})
  await rm(paths.staging, { recursive: true, force: true }).catch(() => {})
  on({ 'APP-On-Progress': { stage: 'installed', version } })
  return paths.install
}

const installHomebrewDashboards = async (
  version: string,
  paths: OpenSearchDashboardsPaths,
  signal: AbortSignal,
  on: (...args: any[]) => void
): Promise<string> => {
  const cellar = global.Server.BrewCellar ?? ''
  let root = await findCellarPackage(cellar, 'opensearch-dashboards', version)
  if (root) {
    if (existsSync(join(root, 'plugins', 'securityDashboards')))
      throw new Error(message('dashboardsDevModeOnly'))
    paths.install = root
    return root
  }
  const info = await brewFormulaInfo('opensearch-dashboards', signal)
  const stable = info?.versions?.stable ?? ''
  if (stable !== version)
    throw new Error(message('dashboardsHomebrewVersionUnavailable', { version }))
  on({ 'APP-On-Progress': { stage: 'installing', version } })
  await runHomebrewInstall('opensearch-dashboards', version, signal, on)
  root = await findCellarPackage(cellar, 'opensearch-dashboards', version)
  if (!root) throw new Error(message('dashboardsHomebrewVersionUnavailable', { version }))
  if (existsSync(join(root, 'plugins', 'securityDashboards')))
    throw new Error(message('dashboardsDevModeOnly'))
  paths.install = root
  return root
}

const runBrew = async (
  args: string[],
  signal: AbortSignal,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> => {
  if (signal.aborted) throw new Error(message('dashboardsOpenCancelled'))
  const env = await EnvSync.sync()
  return new Promise((resolvePromise, reject) => {
    if (signal.aborted) return reject(new Error(message('dashboardsOpenCancelled')))
    const child = spawn('brew', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout = `${stdout}${chunk}`.slice(-1_000_000)
    })
    child.stderr?.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4000)
    })
    const timeout = setTimeout(() => child.kill(), timeoutMs)
    const abort = () => child.kill()
    signal.addEventListener('abort', abort, { once: true })
    child.once('error', (error) => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      if (signal.aborted) return reject(new Error(message('dashboardsOpenCancelled')))
      if (code === 0) return resolvePromise({ stdout, stderr })
      reject(new Error(stderr || `brew exited with code ${code}`))
    })
  })
}

const brewFormulaInfo = async (formula: string, signal: AbortSignal) => {
  const result = await runBrew(['info', '--json', '--formula', formula], signal, 30_000)
  const data = JSON.parse(result.stdout)
  return Array.isArray(data) ? data[0] : undefined
}

const runHomebrewInstall = async (
  formula: string,
  version: string,
  signal: AbortSignal,
  on: (...args: any[]) => void
): Promise<void> => {
  const heartbeat = setInterval(
    () => on({ 'APP-On-Progress': { stage: 'installing', version } }),
    10_000
  )
  try {
    await runBrew(['install', '--force-bottle', formula], signal, 240_000)
  } catch (error: any) {
    if (signal.aborted) throw error
    throw new Error(
      `${message('dashboardsHomebrewVersionUnavailable', { version })}${error?.message ? ` ${error.message}` : ''}`
    )
  } finally {
    clearInterval(heartbeat)
  }
}

const findCellarPackage = async (
  cellar: string,
  formula: string,
  version: string
): Promise<string | undefined> => {
  if (!cellar) return undefined
  const formulaDirs = [formula, 'opensearch-dashboards']
  for (const name of new Set(formulaDirs)) {
    const root = join(cellar, name, version)
    try {
      const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
      if (pkg.version === version && existsSync(dashboardsCli(root))) return root
    } catch {}
  }
  return undefined
}

const dashboardsCli = (root: string) => join(root, 'src', 'cli', 'dist.js')

const findNode = async (root: string, signal?: AbortSignal): Promise<string> => {
  const candidates = [
    join(root, 'node', 'bin', 'node'),
    join(root, 'node', 'node.exe'),
    join(root, 'node', 'x64', 'bin', 'node.exe'),
    join(root, 'node', 'bin', 'node.exe'),
    join(root, 'node.exe'),
    join(root, 'bin', 'node.exe')
  ]
  for (const item of candidates) if (existsSync(item)) return item
  const visit = async (dir: string, depth: number): Promise<string | undefined> => {
    if (depth > 4) return undefined
    for (const child of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const path = join(dir, child.name)
      if (child.isFile() && /^node(?:\.exe)?$/i.test(child.name) && /[/\\]node[/\\]/i.test(path))
        return path
      if (child.isDirectory()) {
        const found = await visit(path, depth + 1)
        if (found) return found
      }
    }
    return undefined
  }
  const node = await visit(root, 0)
  if (node) return node
  let usable: string | undefined
  if (isMacOS()) {
    const useNode = await readFile(join(root, 'bin', 'use_node'), 'utf8').catch(() => '')
    const nodePath = useNode.match(/^\s*NODE\s*=\s*["']?([^\s"']+)["']?/m)?.[1]
    if (nodePath && nodePath.startsWith('/') && existsSync(nodePath)) usable = nodePath
    if (usable) {
      if (signal?.aborted) throw new Error(message('dashboardsOpenCancelled'))
      const versionOutput = await new Promise<string>((resolveVersion, reject) => {
        const child = spawn(usable!, ['--version'], {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore']
        })
        let output = ''
        child.stdout?.on('data', (chunk) => {
          output += chunk
        })
        const abort = () => child.kill()
        signal?.addEventListener('abort', abort, { once: true })
        child.once('error', reject)
        child.once('close', (code) => {
          signal?.removeEventListener('abort', abort)
          if (code === 0) resolveVersion(output.trim())
          else reject(new Error('Node.js version check failed'))
        })
      })
      if (!/^v22\./.test(versionOutput)) usable = undefined
    }
  }
  if (!usable) throw new Error(message('dashboardsNodeMissing'))
  return usable
}

const createConfig = async (
  file: string,
  data: string,
  logs: string,
  backendPort: number,
  port: number
) => {
  const existing = existsSync(file) ? await readFile(file, 'utf8') : ''
  const retained = existing
    .split(/\r?\n/)
    .filter(
      (line) =>
        !/^\s*(server\.(?:host|port)|opensearch\.(?:hosts|ssl\.)|path\.(?:data|logs))\s*:/.test(
          line
        )
    )
  const config = [
    ...retained.filter(
      (line) => !/^\s*(?:opensearch_security(?:\.|\s*:)|logging\.dest\s*:)/.test(line)
    ),
    'server.host: "127.0.0.1"',
    `server.port: ${port}`,
    `opensearch.hosts: ["http://127.0.0.1:${backendPort}"]`,
    `path.data: "${data.replaceAll('\\', '/')}"`,
    `logging.dest: "${join(logs, 'dashboards.log').replaceAll('\\', '/')}"`,
    ''
  ].join('\n')
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, config)
}

const startProcess = async (
  node: string,
  entry: string,
  config: string,
  paths: OpenSearchDashboardsPaths,
  port: number
): Promise<string> => {
  await mkdir(paths.instance, { recursive: true })
  await mkdir(paths.data, { recursive: true })
  await mkdir(paths.logs, { recursive: true })
  const cli = dashboardsCli(paths.install)
  // Dashboards resolves Windows paths through synchronous PowerShell commands.
  // Apply console hiding inside this companion, including its own dependencies.
  const launch = `if (process.platform === 'win32') {
  const childProcess = require('node:child_process');
  const execSync = childProcess.execSync;
  childProcess.execSync = function (command, options) {
    return execSync.call(this, command, { ...options, windowsHide: true });
  };
}
process.argv.splice(1, 1, ${JSON.stringify(cli)}); require(${JSON.stringify(cli)});\n`
  await writeFile(entry, launch)
  const synchronizedEnv = await EnvSync.sync()
  const outputFd = openSync(paths.output, 'a')
  const errorFd = openSync(paths.error, 'a')
  let child: ReturnType<typeof spawn>
  try {
    child = spawn(
      node,
      [
        '--no-warnings',
        '--max-http-header-size=65536',
        '--unhandled-rejections=warn',
        entry,
        '-c',
        config,
        '-p',
        `${port}`
      ],
      {
        cwd: paths.install,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', outputFd, errorFd],
        env: {
          ...synchronizedEnv,
          NODE_ENV: 'production',
          OSD_PATH_CONF: dirname(config),
          OSD_HOME: paths.install
        }
      }
    )
  } finally {
    closeSync(outputFd)
    closeSync(errorFd)
  }
  const pid = await new Promise<string>((resolvePid, reject) => {
    child.once('error', reject)
    child.once('spawn', () => resolvePid(`${child.pid ?? ''}`))
  })
  child.unref()
  if (!pid) throw new Error(message('dashboardsStartPidMissing'))
  try {
    await writeFile(paths.pid, pid)
  } catch (error: any) {
    error.startedPid = pid
    throw error
  }
  return pid
}

const defaultReady = async (
  url: string,
  pid: string,
  paths: OpenSearchDashboardsPaths,
  signal: AbortSignal,
  on: (...args: any[]) => void
): Promise<void> => {
  let last = ''
  const expectedVersion = JSON.parse(
    await readFile(join(paths.install, 'package.json'), 'utf8')
  ).version
  on({ 'APP-On-Progress': { stage: 'starting', pid } })
  const heartbeat = setInterval(() => on({ 'APP-On-Progress': { stage: 'starting', pid } }), 10_000)
  try {
    for (let attempt = 0; attempt < READY_ATTEMPTS; attempt++) {
      if (signal.aborted) throw new Error(message('dashboardsOpenCancelled'))
      let response
      try {
        response = await axios.get(`${url}/api/status`, {
          timeout: 2000,
          proxy: false,
          validateStatus: () => true
        })
      } catch (error: any) {
        last = error?.message ?? 'not ready'
        await waitTime(READY_DELAY)
        continue
      }
      if (response.status === 401 || response.status === 403)
        throw new Error(message('dashboardsAuthUnsupported'))
      if (response.status === 200) {
        const actualVersion = response.data?.version?.number
        if (typeof actualVersion !== 'string' || actualVersion !== expectedVersion) {
          throw new Error(
            message('dashboardsVersionMismatch', {
              expected: expectedVersion,
              actual: actualVersion ?? 'unknown'
            })
          )
        }
        if (!(await panelOwnsListener(pid, paths)))
          throw new Error(message('dashboardsInstanceInvalid'))
        return
      }
      last = `HTTP ${response.status}`
      await waitTime(READY_DELAY)
    }
    let logs = ''
    for (const path of [paths.error, paths.output])
      if (existsSync(path)) logs += `\n${readFileSync(path, 'utf8').slice(-4000)}`
    throw new Error(
      message('dashboardsStartTimeout', { pid, detail: last, logs: logs.slice(-6000) })
    )
  } finally {
    clearInterval(heartbeat)
  }
}

const panelOwnsListener = async (
  pid: string,
  paths: OpenSearchDashboardsPaths
): Promise<boolean> => {
  const [processes, listeners] = await Promise.all([
    fetchStopProcessListLocal(),
    fetchLoopbackListeningPids(
      `${yamlValue(await readFile(paths.config, 'utf8'), 'server.port') ?? ''}`
    )
  ])
  const process = processes.find((item) => item.PID === pid)
  return (
    !!process &&
    process.COMMAND.includes(paths.entry) &&
    process.COMMAND.includes(paths.config) &&
    listeners.includes(pid)
  )
}

class OpenSearchDashboardsPanel extends Base {
  constructor(
    readonly paths: OpenSearchDashboardsPaths,
    readonly identity: OpenSearchDashboardsMetadata,
    private readonly processList: () => Promise<PItem[]>
  ) {
    super()
    this.type = `opensearch-dashboards-${backendInstanceId({ version: identity.version, path: identity.backendPath, bin: identity.backendBin } as SoftInstalled)}`
    this.pidPath = paths.pid
  }
  protected _stopSearchName() {
    return 'node'
  }
  protected _stopSignal() {
    return '-TERM'
  }
  protected ownedProcessMarkers(_version: SoftInstalled) {
    return [this.identity.entry, this.identity.configPath]
  }
  protected windowsServiceTargets(version: SoftInstalled) {
    return super.windowsServiceTargets(
      version,
      [this.identity.entry, this.identity.configPath],
      (process) =>
        process.COMMAND.includes(this.identity.entry) &&
        process.COMMAND.includes(this.identity.configPath)
    )
  }
  async stop(item: SoftInstalled & { dashboard: OpenSearchDashboardsMetadata }): Promise<string[]> {
    const context = currentServiceStopContext()
    const snapshot = context?.processList
    const pidFile = existsSync(this.paths.pid)
      ? (await readFile(this.paths.pid, 'utf8')).trim()
      : ''
    const pid = pidFile || `${item.pid ?? ''}`
    // A stop snapshot can predate this runtime's own just-created PID. Only that
    // runtime-owned PID gets a fresh discovery read; all other candidates use Base's snapshot.
    const justCreated = !!pid && this.createdPid === pid && !snapshot?.some((p) => p.PID === pid)
    const run = () => this.stopService(item, undefined)
    const result: any = justCreated
      ? await withServiceStopContext(
          { processList: await fetchStopProcessListLocal(), reason: context?.reason ?? 'stop' },
          run
        )
      : await this.stopService(item)
    this.createdPid = ''
    return result?.['APP-Service-Stop-PID'] ?? []
  }
  createdPid = ''
  processes() {
    return this.processList()
  }
}

const defaultDeps = (): OpenSearchDashboardsRuntimeDependencies => ({
  baseDir: () => global.Server.BaseDir!,
  platform: toPlatform,
  arch: toArch,
  probeBackend: defaultProbeBackend,
  install: downloadAndInstall,
  findPort: (start, count, max) => findLoopbackPort(start, count, max),
  start: startProcess,
  ready: defaultReady,
  checkReady: async (url, pid, paths, expectedVersion) => {
    try {
      const response = await axios.get(`${url}/api/status`, {
        timeout: 1200,
        proxy: false,
        validateStatus: () => true
      })
      if (response.status !== 200) return false
      return (
        response.data?.version?.number === expectedVersion && (await panelOwnsListener(pid, paths))
      )
    } catch {
      return false
    }
  },
  stopOwned: async (item, owner) => {
    if (owner) return owner.stop(item)
    const paths = deriveValidatedPaths(item, global.Server.BaseDir!)
    const panel = new OpenSearchDashboardsPanel(paths, item.dashboard, StopProcessListFetch)
    return panel.stop(item)
  },
  processes: StopProcessListFetch
})

const deriveValidatedPaths = (
  item: SoftInstalled & { dashboard: OpenSearchDashboardsMetadata },
  baseDir: string
): OpenSearchDashboardsPaths => {
  if (
    !isOpenSearchDashboardsItem(item) ||
    item.version !== item.dashboard.version ||
    item.bin !== item.dashboard.backendBin ||
    item.path !== item.dashboard.backendPath
  ) {
    throw new Error(message('dashboardsInstanceInvalid'))
  }
  const paths = dashboardsPaths(baseDir, item)
  const metadata = item.dashboard
  const expected = {
    entry: paths.entry,
    configPath: paths.config,
    dataPath: paths.data,
    logPath: paths.logs,
    pidPath: paths.pid
  }
  for (const [key, value] of Object.entries(expected)) {
    if (resolve((metadata as any)[key]) !== resolve(value))
      throw new Error(message('dashboardsInstanceInvalid'))
  }
  const root = resolve(paths.root)
  if (!resolve(paths.instance).startsWith(`${root}${sep}`))
    throw new Error(message('dashboardsInstanceInvalid'))
  return paths
}

export class OpenSearchDashboardsRuntime {
  private readonly deps: OpenSearchDashboardsRuntimeDependencies
  private coordinationState?: OpenSearchDashboardsCoordination
  private readonly active = new Map<
    string,
    {
      item: SoftInstalled & { dashboard: OpenSearchDashboardsMetadata }
      owner: OpenSearchDashboardsPanel
    }
  >()
  private readonly flights = new Map<string, Promise<DashboardsOpenResult>>()
  private readonly preparations = new Map<string, Promise<string>>()
  private queue: Promise<unknown> = Promise.resolve()
  private controller?: AbortController
  private stopping = false

  constructor(deps: Partial<OpenSearchDashboardsRuntimeDependencies> = {}) {
    this.deps = { ...defaultDeps(), ...deps }
  }

  private get coordination() {
    return (this.coordinationState ??= new OpenSearchDashboardsCoordination(this.deps.baseDir()))
  }

  private async assertCurrent(generation: string) {
    try {
      await this.coordination.assertCurrent(generation)
    } catch (error) {
      if ((error as Error)?.name === 'OpenSearchDashboardsGenerationChangedError')
        throw new Error(message('dashboardsOpenCancelled'))
      throw error
    }
  }

  private async releaseLock(release?: () => Promise<void>) {
    try {
      await release?.()
    } catch (error) {
      // Resource cleanup is supplementary; retain the completed start/stop outcome.
      console.warn('[OpenSearchDashboards] Could not release operation lock:', error)
    }
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const operation = this.queue.then(work)
    this.queue = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }

  prepare(version: SoftInstalled, on: (...args: any[]) => void): Promise<string> {
    if (this.stopping || this.pendingStops > 0)
      return Promise.reject(new Error(message('dashboardsOpenCancelled')))
    const key = `${version.version}\0${version.path}\0${version.bin}`
    const existing = this.preparations.get(key)
    if (existing) return existing
    const operation = this.serialize(async () => {
      if (this.stopping) throw new Error(message('dashboardsOpenCancelled'))
      if (!/^\d+\.\d+\.\d+$/.test(version?.version ?? '') || !version.path || !version.bin)
        throw new Error(message('dashboardsVersionInvalid'))
      const controller = new AbortController()
      this.controller = controller
      const budgetTimer = setTimeout(() => controller.abort(), 900_000)
      let release: (() => Promise<void>) | undefined
      let stopObserving: (() => void) | undefined
      try {
        const generation = await this.coordination.readGeneration()
        stopObserving = this.coordination.observe(controller, generation)
        await this.deps.probeBackend(version, controller.signal, on)
        if (this.stopping || controller.signal.aborted)
          throw new Error(message('dashboardsOpenCancelled'))
        const paths = dashboardsPaths(this.deps.baseDir(), version)
        release = await this.coordination.acquire(
          `software-${version.version}`,
          controller.signal,
          900_000
        )
        await this.assertCurrent(generation)
        const install = await this.ensureInstalled(version.version!, paths, controller.signal, on)
        await findNode(install, controller.signal)
        if (this.stopping || controller.signal.aborted)
          throw new Error(message('dashboardsOpenCancelled'))
        await this.assertCurrent(generation)
        return generation
      } finally {
        stopObserving?.()
        try {
          await this.releaseLock(release)
        } finally {
          clearTimeout(budgetTimer)
          this.controller = undefined
        }
      }
    }).finally(() => {
      if (this.preparations.get(key) === operation) this.preparations.delete(key)
    })
    this.preparations.set(key, operation)
    return operation
  }

  private async ensureInstalled(
    version: string,
    paths: OpenSearchDashboardsPaths,
    signal: AbortSignal,
    on: (...args: any[]) => void
  ): Promise<string> {
    if (
      this.deps.platform() === 'macos' ||
      !existsSync(join(paths.install, 'src', 'cli', 'dist.js'))
    )
      return this.deps.install(version, paths, signal, on)
    return paths.install
  }

  open(
    version: SoftInstalled,
    on: (...args: any[]) => void,
    generation?: string
  ): Promise<DashboardsOpenResult> {
    if (this.stopping || this.pendingStops > 0)
      return Promise.reject(new Error(message('dashboardsOpenCancelled')))
    const key = `${version.version}\0${version.path}\0${version.bin}\0${generation ?? 'current'}`
    const existing = this.flights.get(key)
    if (existing) return existing
    const operation = this.serialize(() => this.openInternal(version, on, generation)).finally(
      () => {
        if (this.flights.get(key) === operation) this.flights.delete(key)
      }
    )
    this.flights.set(key, operation)
    return operation
  }

  private async openInternal(
    version: SoftInstalled,
    on: (...args: any[]) => void,
    preparedGeneration?: string
  ): Promise<DashboardsOpenResult> {
    if (this.stopping) throw new Error(message('dashboardsOpenCancelled'))
    if (!/^\d+\.\d+\.\d+$/.test(version?.version ?? '') || !version.path || !version.bin)
      throw new Error(message('dashboardsVersionInvalid'))
    const exactVersion = version.version as string
    const controller = new AbortController()
    this.controller = controller
    const budgetTimer = setTimeout(() => controller.abort(), 300_000)
    let release: (() => Promise<void>) | undefined
    let stopObserving: (() => void) | undefined
    try {
      const generation = preparedGeneration ?? (await this.coordination.readGeneration())
      await this.assertCurrent(generation)
      stopObserving = this.coordination.observe(controller, generation)
      release = await this.coordination.acquire('lifecycle', controller.signal)
      await this.assertCurrent(generation)
      const backend = await this.deps.probeBackend(version, controller.signal, on)
      if (this.stopping || controller.signal.aborted)
        throw new Error(message('dashboardsOpenCancelled'))
      const paths = dashboardsPaths(this.deps.baseDir(), version)
      const key = backendInstanceId(version)
      const existingPid = existsSync(paths.pid) ? (await readFile(paths.pid, 'utf8')).trim() : ''
      if (existingPid && existsSync(paths.entry) && existsSync(paths.config)) {
        const processes = await this.deps.processes()
        const owned = processes.some(
          (proc) =>
            proc.PID === existingPid &&
            proc.COMMAND.includes(paths.entry) &&
            proc.COMMAND.includes(paths.config)
        )
        const config = await readFile(paths.config, 'utf8')
        const port = Number(yamlValue(config, 'server.port'))
        const metadata: OpenSearchDashboardsMetadata = {
          version: version.version!,
          backendBin: version.bin,
          backendPath: version.path,
          backendPid: `${version.pid ?? ''}`,
          entry: paths.entry,
          nodeBin: '',
          configPath: paths.config,
          dataPath: paths.data,
          logPath: paths.logs,
          pidPath: paths.pid,
          port
        }
        const item = {
          ...version,
          typeFlag: 'opensearch' as const,
          dashboard: metadata,
          pid: existingPid
        }
        if (
          owned &&
          Number.isInteger(port) &&
          (await this.deps.checkReady(`http://127.0.0.1:${port}`, existingPid, paths, exactVersion))
        ) {
          if (this.stopping || controller.signal.aborted)
            throw new Error(message('dashboardsOpenCancelled'))
          await this.assertCurrent(generation)
          const owner = new OpenSearchDashboardsPanel(paths, metadata, this.deps.processes)
          this.active.set(key, { item, owner })
          return {
            url: `http://127.0.0.1:${port}`,
            'APP-Service-Start-PID': existingPid,
            'APP-Service-Start-Item': item
          }
        }
        if (owned) {
          const owner = new OpenSearchDashboardsPanel(paths, metadata, this.deps.processes)
          await this.deps.stopOwned(item, owner)
        }
      }
      const releaseSoftware = await this.coordination.acquire(
        `software-${exactVersion}`,
        controller.signal
      )
      let install: string
      try {
        install = await this.ensureInstalled(exactVersion, paths, controller.signal, on)
      } finally {
        await this.releaseLock(releaseSoftware)
      }
      if (this.stopping || controller.signal.aborted)
        throw new Error(message('dashboardsOpenCancelled'))
      const node = await findNode(install, controller.signal)
      const port = await this.deps.findPort(START_PORT, PORT_SCAN, 65535)
      await createConfig(paths.config, paths.data, paths.logs, backend.port, port)
      const metadata: OpenSearchDashboardsMetadata = {
        version: exactVersion,
        backendBin: version.bin!,
        backendPath: version.path!,
        backendPid: `${version.pid ?? ''}`,
        entry: paths.entry,
        nodeBin: node,
        configPath: paths.config,
        dataPath: paths.data,
        logPath: paths.logs,
        pidPath: paths.pid,
        port
      }
      const item = { ...version, typeFlag: 'opensearch' as const, dashboard: metadata, pid: '' }
      const owner = new OpenSearchDashboardsPanel(paths, metadata, this.deps.processes)
      let pid = ''
      try {
        if (this.stopping || controller.signal.aborted)
          throw new Error(message('dashboardsOpenCancelled'))
        await mkdir(paths.instance, { recursive: true })
        await writeFile(paths.metadata, JSON.stringify(item, null, 2))
        const runtimePaths = { ...paths, install }
        try {
          pid = await this.deps.start(node, paths.entry, paths.config, runtimePaths, port)
          owner.createdPid = pid
          item.pid = pid
        } catch (startError: any) {
          pid = `${startError?.startedPid ?? ''}`
          if (pid) {
            item.pid = pid
            owner.createdPid = pid
            await writeFile(paths.metadata, JSON.stringify(item, null, 2)).catch(() => {})
          }
          throw startError
        }
        item.pid = pid
        owner.createdPid = pid
        await writeFile(paths.metadata, JSON.stringify(item, null, 2))
        this.active.set(backendInstanceId(version), { item, owner })
        await this.deps.ready(`http://127.0.0.1:${port}`, pid, runtimePaths, controller.signal, on)
        if (this.stopping || controller.signal.aborted)
          throw new Error(message('dashboardsOpenCancelled'))
        await this.assertCurrent(generation)
        owner.createdPid = ''
        return {
          url: `http://127.0.0.1:${port}`,
          'APP-Service-Start-PID': pid,
          'APP-Service-Start-Item': item
        }
      } catch (error) {
        if (pid) {
          try {
            await this.deps.stopOwned(item, owner)
          } catch (cleanupError: any) {
            throw new Error(
              `${error instanceof Error ? error.message : error}; ${message('dashboardsCleanupFailed', { pid, error: cleanupError?.message ?? cleanupError })}`
            )
          }
          this.active.delete(backendInstanceId(version))
          if (!existsSync(paths.pid)) await rm(paths.metadata, { force: true }).catch(() => {})
        }
        throw error
      }
    } finally {
      stopObserving?.()
      try {
        await this.releaseLock(release)
      } finally {
        clearTimeout(budgetTimer)
        this.controller = undefined
      }
    }
  }

  stopInstance(item: SoftInstalled): Promise<string[]> {
    this.pendingStops++
    this.stopping = true
    this.controller?.abort()
    const invalidation = this.coordination.invalidate()
    void invalidation.catch(() => {}) // Await the original promise below even when queued.
    return this.serialize(async () => {
      let release: (() => Promise<void>) | undefined
      try {
        await invalidation
        release = await this.coordination.acquire('lifecycle')
        if (!isOpenSearchDashboardsItem(item)) throw new Error(message('dashboardsInstanceInvalid'))
        const paths = deriveValidatedPaths(item, this.deps.baseDir())
        const key = backendInstanceId(item)
        const active = this.active.get(key)
        const pids = await this.deps.stopOwned(item, active?.owner)
        this.active.delete(key)
        if (!existsSync(paths.pid)) await rm(paths.metadata, { force: true }).catch(() => {})
        return pids
      } finally {
        try {
          await this.releaseLock(release)
        } finally {
          this.finishStop()
        }
      }
    })
  }

  stopAll(): Promise<string[]> {
    this.pendingStops++
    this.stopping = true
    this.controller?.abort()
    const invalidation = this.coordination.invalidate()
    void invalidation.catch(() => {}) // Await the original promise below even when queued.
    return this.serialize(async () => {
      let release: (() => Promise<void>) | undefined
      try {
        await invalidation
        release = await this.coordination.acquire('lifecycle')
        const errors: string[] = []
        const items = new Map<
          string,
          {
            item: SoftInstalled & { dashboard: OpenSearchDashboardsMetadata }
            owner?: OpenSearchDashboardsPanel
          }
        >()
        for (const [key, active] of this.active) items.set(key, active)
        const directory = join(this.deps.baseDir(), DASHBOARD_ROOT, 'instances')
        let names: string[] = []
        try {
          names = await readdir(directory)
        } catch (error: any) {
          if (error?.code !== 'ENOENT')
            errors.push(`Could not inspect instance records: ${error?.message ?? error}`)
        }
        for (const name of names) {
          const file = join(directory, name, 'instance.json')
          try {
            const item = JSON.parse(await readFile(file, 'utf8'))
            if (!isOpenSearchDashboardsItem(item))
              throw new Error('Invalid OpenSearch Dashboards item metadata')
            deriveValidatedPaths(item, this.deps.baseDir())
            const key = backendInstanceId(item)
            if (!items.has(key)) items.set(key, { item })
          } catch (error: any) {
            const detail = `Skipped unverifiable instance record ${name}: ${error?.message ?? error}`
            console.warn('[OpenSearchDashboards]', detail)
          }
        }
        const outcomes = await Promise.allSettled(
          [...items.entries()].map(async ([key, active]) => {
            const paths = deriveValidatedPaths(active.item, this.deps.baseDir())
            const pids = await this.deps.stopOwned(active.item, active.owner)
            this.active.delete(key)
            if (!existsSync(paths.pid)) await rm(paths.metadata, { force: true }).catch(() => {})
            return pids
          })
        )
        const stopped = outcomes
          .filter((item): item is PromiseFulfilledResult<string[]> => item.status === 'fulfilled')
          .flatMap((item) => item.value)
        errors.push(
          ...outcomes
            .filter((item): item is PromiseRejectedResult => item.status === 'rejected')
            .map((item) => `${item.reason}`)
        )
        if (errors.length)
          throw new Error(
            message('dashboardsStopPartial', {
              pids: [...new Set(stopped)].join(', ') || 'none',
              errors: errors.join('; ')
            })
          )
        return [...new Set(stopped)]
      } finally {
        try {
          await this.releaseLock(release)
        } finally {
          this.finishStop()
        }
      }
    })
  }

  private pendingStops = 0
  private finishStop() {
    this.pendingStops = Math.max(0, this.pendingStops - 1)
    this.stopping = this.pendingStops > 0
  }
}

const OpenSearchDashboards = new OpenSearchDashboardsRuntime()
export default OpenSearchDashboards
