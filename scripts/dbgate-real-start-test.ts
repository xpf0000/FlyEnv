import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { request } from 'node:http'
import axios from 'axios'
import { join } from 'node:path'
import { rm as removePath } from 'node:fs/promises'
import {
  dbGateEnv,
  dbGateUrl,
  DbGateRuntime,
  type DbGateCredentials
} from '../src/fork/module/DbGate/index'
import { serviceStartSpawn } from '../src/fork/util/ServiceStart'
import { waitTime } from '../src/shared/utils'
import { findLoopbackPort } from '../src/shared/LoopbackPort'

// Keep this test independent from FlyEnv's installed dbgate directory.
const nodeBin = 'D:\\Program Files\\PhpWebStudy-Data\\app\\nodejs\\v24.3.0\\node.exe'
const nodeDir = 'D:\\Program Files\\PhpWebStudy-Data\\app\\nodejs\\v24.3.0'
const tempParent = 'D:\\Program Files\\PhpWebStudy-Data\\server'
const cleanup = process.argv.includes('--cleanup')
const lifetime = process.argv.includes('--lifetime')
const freshWorkspace = process.argv.includes('--fresh-workspace')
const baseDirArg = process.argv
  .find((arg) => arg.startsWith('--base-dir='))
  ?.slice('--base-dir='.length)
const execFilePromise = promisify(execFile)

if (!existsSync(nodeBin)) {
  throw new Error(`Node.js executable was not found: ${nodeBin}`)
}

// serviceStartSpawn/EnvSync expect the fork process server object to exist.
;(globalThis as any).Server = { Proxy: {} }

const createdTempDir = !baseDirArg
const baseDir = baseDirArg ?? (await mkdtemp(join(tempParent, 'dbgate-real-start-test-')))
const runtime = new DbGateRuntime(baseDir, { debugUpstream: true })
const node = {
  typeFlag: 'node',
  version: '24.3.0',
  bin: nodeBin,
  path: nodeDir,
  num: 2403,
  enable: true,
  run: false,
  running: false
} as any

const safeUrl = (url: string) => url.replace(/^http:\/\/[^@]+@/, 'http://')
const tail = async (file: string) => {
  try {
    const content = await readFile(file, 'utf8')
    return content.trim().split(/\r?\n/).slice(-20).join('\n') || '<empty>'
  } catch {
    return '<unavailable>'
  }
}

const upstreamDebugFile = join(runtime.paths.log, 'dbgate.upstream.debug.log')

const probeHttp = (hostname: string, port: number) =>
  new Promise<string>((resolve) => {
    const req = request({ hostname, port, path: '/', timeout: 3_000 }, (response) => {
      response.resume()
      resolve(`HTTP ${response.statusCode}`)
    })
    req.once('timeout', () => req.destroy(new Error('timeout')))
    req.once('error', (error) =>
      resolve(`${(error as NodeJS.ErrnoException).code ?? error.name}: ${error.message}`)
    )
    req.end()
  })

const startupNetworkDiagnostics = async (port: number, credentials?: DbGateCredentials) => {
  const probes = await Promise.all(
    ['127.0.0.1', '::1', 'localhost'].map(async (host) => `${host}=${await probeHttp(host, port)}`)
  )
  if (credentials) {
    try {
      const response = await axios.get(dbGateUrl(port, credentials), {
        timeout: 3_000,
        validateStatus: () => true
      })
      probes.push(`axios=${response.status}`)
    } catch (error) {
      const item = error as { code?: string; message?: string }
      probes.push(`axios=${[item.code, item.message ?? `${error}`].filter(Boolean).join(': ')}`)
    }
  }
  let listeners = '<unavailable>'
  try {
    const { stdout } = await execFilePromise('netstat', ['-ano', '-p', 'tcp'], {
      windowsHide: true
    })
    listeners =
      stdout
        .split(/\r?\n/)
        .filter((line) => line.trim().endsWith(`:${port}`) || line.includes(`:${port} `))
        .join('\n') || '<none>'
  } catch (error) {
    listeners = `${error}`
  }
  return `NETWORK_PROBES:\n${probes.join('\n')}\nNETSTAT:\n${listeners}`
}

const startedAt = Date.now()
console.log(`REPRO_ROOT=${baseDir}`)
console.log(`NODE=${nodeBin}`)
console.log(
  `FIRST_INSTALL=${existsSync(runtime.paths.entry) ? 'reusing installed DbGate package' : 'starting npm install and first DbGate startup'}`
)

try {
  if (lifetime) {
    if (!existsSync(runtime.paths.entry) || !existsSync(runtime.paths.credentials)) {
      throw new Error('--lifetime requires an installed DbGate package and credentials file')
    }
    const credentials = JSON.parse(await readFile(runtime.paths.credentials, 'utf8'))
    const port = await findLoopbackPort(3000, 20, 65535)
    const startPaths = freshWorkspace
      ? { ...runtime.paths, workspace: join(runtime.paths.root, 'workspace-fresh') }
      : runtime.paths
    if (freshWorkspace) await removePath(startPaths.workspace, { recursive: true, force: true })
    console.log(`LIFETIME_PORT=${port}`)
    const started = await serviceStartSpawn({
      version: {
        typeFlag: 'mongodb',
        version: 'dbgate',
        bin: node.bin,
        path: runtime.paths.root
      } as any,
      pidPath: runtime.paths.pid,
      baseDir: runtime.paths.root,
      bin: node.bin,
      execArgs: [runtime.paths.entry],
      execEnv: dbGateEnv(startPaths, port, credentials),
      cwd: runtime.paths.root,
      outFile: runtime.paths.startOut,
      errFile: runtime.paths.startError,
      on: () => {},
      waitTime: 10_000
    })
    console.log(`LIFETIME_START pid=${started['APP-Service-Start-PID']}`)
    for (let second = 0; second < 20; second += 1) {
      console.log(
        `LIFETIME_SECOND=${second}\n${await startupNetworkDiagnostics(port, credentials)}`
      )
      await waitTime(1_000)
    }
    console.log('RESULT=PASS')
  } else {
    const first = await runtime.open(node)
    console.log(
      `FIRST_SUCCESS elapsedMs=${Date.now() - startedAt} pid=${first['APP-Service-Start-PID']} url=${safeUrl(first.url)}`
    )
    console.log(
      `FIRST_FILES entry=${existsSync(runtime.paths.entry)} pid=${existsSync(runtime.paths.pid)} port=${existsSync(runtime.paths.port)}`
    )

    const secondStartedAt = Date.now()
    const second = await runtime.open(node)
    console.log(
      `SECOND_SUCCESS elapsedMs=${Date.now() - secondStartedAt} pid=${second['APP-Service-Start-PID']} url=${safeUrl(second.url)}`
    )
    console.log(`PORT=${(await readFile(runtime.paths.port, 'utf8')).trim()}`)
    console.log(`UPSTREAM_DEBUG_FILE=${upstreamDebugFile}`)
    console.log(`UPSTREAM_DEBUG_TAIL:\n${await tail(upstreamDebugFile)}`)
    console.log('RESULT=PASS')
  }
} catch (error) {
  console.error(`RESULT=FAIL\n${error instanceof Error ? error.message : error}`)
  console.error(await startupNetworkDiagnostics(3000))
  console.error(`START_STDOUT:\n${await tail(runtime.paths.startOut)}`)
  console.error(`START_STDERR:\n${await tail(runtime.paths.startError)}`)
  console.error(`UPSTREAM_DEBUG_FILE=${upstreamDebugFile}`)
  console.error(`UPSTREAM_DEBUG_TAIL:\n${await tail(upstreamDebugFile)}`)
  process.exitCode = 1
} finally {
  await runtime.stop().catch((error) => console.error(`STOP_ERROR=${error}`))
  if (cleanup && createdTempDir) {
    await rm(baseDir, { recursive: true, force: true })
    console.log(`CLEANED=${baseDir}`)
  } else if (cleanup) {
    console.log(`PRESERVED=${baseDir} (--cleanup only removes a directory created by this script)`)
  } else {
    console.log(`PRESERVED=${baseDir}`)
  }
}
