import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const sevenZip = require('7zip-min-electron') as {
  pack(source: string, target: string, callback: (error?: Error | null) => void): void
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const smokeRoot = await mkdtemp(path.join(tmpdir(), 'flyenv-plugin-runtime-smoke-'))
const resultPath = path.join(smokeRoot, 'result.json')
const dataRoot = path.join(smokeRoot, 'data')
let runner: ReturnType<typeof spawn> | undefined

const pack = (source: string, target: string) =>
  new Promise<void>((resolve, reject) =>
    sevenZip.pack(source, target, (error) => (error ? reject(error) : resolve()))
  )

const createPackage = async (version: string) => {
  const packageRoot = path.join(smokeRoot, `runtime-smoke-${version}`)
  await mkdir(path.join(packageRoot, 'render'), { recursive: true })
  await mkdir(path.join(packageRoot, 'fork'), { recursive: true })
  await writeFile(
    path.join(packageRoot, 'plugin.json'),
    JSON.stringify({
      apiVersion: 1,
      id: 'runtime-smoke-plugin',
      name: 'Runtime Smoke Plugin',
      version,
      module: {
        typeFlag: 'runtime-smoke-plugin',
        moduleType: 'other',
        label: 'Runtime Smoke',
        isService: true
      },
      entry: { render: 'render/index.mjs', fork: 'fork/index.mjs' }
    })
  )
  await writeFile(
    path.join(packageRoot, 'render/index.mjs'),
    `const Smoke = { template: '<div data-runtime-smoke="ready">runtime-smoke</div>' }
export default { typeFlag: 'runtime-smoke-plugin', label: 'Runtime Smoke', asideIndex: 999, index: Smoke, aside: Smoke, version: ${JSON.stringify(version)} }`
  )
  await writeFile(
    path.join(packageRoot, 'fork/index.mjs'),
    `
const response = (data) => ({
  on() { return this },
  then(resolve) { return Promise.resolve({ code: 0, data }).then(resolve) }
})
export default {
  init() {},
  exec(name, item) {
    if (name === 'allInstalledVersions') return response([{ version: ${JSON.stringify(version)}, bin: 'runtime-smoke', enable: true }])
    if (name === 'startService') return response({ started: true, version: item?.version })
    if (name === 'stopService') return response({ stopped: true, version: item?.version })
    return response(true)
  }
}
`
  )
  const archivePath = path.join(smokeRoot, `runtime-smoke-${version}.flyenv-plugin`)
  await pack(packageRoot, archivePath)
  const bytes = await readFile(archivePath)
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
}

const waitForResult = async (timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      return JSON.parse(await readFile(resultPath, 'utf8')) as {
        ok: boolean
        checkpoints: string[]
        error?: string
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Timed out waiting for the Electron plugin runtime smoke result')
}

const stopRunner = () => {
  if (!runner?.pid) return
  try {
    process.kill(-runner.pid, 'SIGTERM')
  } catch {
    runner.kill('SIGTERM')
  }
}

const v1 = await createPackage('1.0.0')
const v2 = await createPackage('2.0.0')
let phase = 1
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (url.pathname === '/registry.json') {
    const version = phase === 1 ? '1.0.0' : '2.0.0'
    const artifact = phase === 1 ? v1 : v2
    response.setHeader('content-type', 'application/json')
    response.end(
      JSON.stringify({
        schemaVersion: 1,
        plugins: [
          {
            id: 'runtime-smoke-plugin',
            name: 'Runtime Smoke Plugin',
            version,
            artifact: {
              url: `http://127.0.0.1:${(server.address() as any).port}/runtime-smoke-${version}.flyenv-plugin`,
              sha256: artifact.sha256
            }
          }
        ]
      })
    )
    return
  }
  if (url.pathname === '/runtime-smoke-1.0.0.flyenv-plugin') {
    phase = 2
    response.end(v1.bytes)
    return
  }
  if (url.pathname === '/runtime-smoke-2.0.0.flyenv-plugin') {
    response.end(v2.bytes)
    return
  }
  response.statusCode = 404
  response.end('not found')
})

try {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = (server.address() as any).port
  await new Promise<void>((resolve, reject) => {
    const build = spawn('yarn', ['build-dev-runner'], { cwd: root, stdio: 'inherit' })
    build.once('error', reject)
    build.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`build-dev-runner exited ${code}`))
    )
  })

  const launchPhase = async (smokePhase: 'install' | 'verify') => {
    await rm(resultPath, { force: true })
    let output = ''
    runner = spawn(process.execPath, ['electron/dev-runner.mjs'], {
      cwd: root,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        FLYENV_DATA_ROOT: dataRoot,
        FLYENV_PLUGIN_REGISTRY_URL: `http://127.0.0.1:${port}/registry.json`,
        FLYENV_PLUGIN_SMOKE: '1',
        FLYENV_PLUGIN_SMOKE_PHASE: smokePhase,
        FLYENV_PLUGIN_SMOKE_RESULT: resultPath
      }
    })
    const collect = (chunk: Buffer) => {
      output = `${output}${chunk.toString()}`.slice(-100_000)
    }
    runner.stdout?.on('data', collect)
    runner.stderr?.on('data', collect)
    const result = await waitForResult(90_000).catch((error) => {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n${output}`)
    })
    stopRunner()
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    return result
  }

  const installed = await launchPhase('install')
  assert.equal(installed.ok, true, installed.error)
  assert.deepEqual(installed.checkpoints, ['install'])
  const result = await launchPhase('verify')
  assert.equal(result.ok, true, result.error)
  const expected = [
    'install',
    'relaunch',
    'renderer-route',
    'fork-version-scan',
    'start-stop',
    'update',
    'disable',
    're-enable',
    'uninstall',
    'pending-cleanup',
    'runtime-data-preserved'
  ]
  assert.deepEqual(result.checkpoints, expected)
  console.log(`plugin runtime smoke passed: ${result.checkpoints.join(', ')}`)
} finally {
  stopRunner()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await rm(smokeRoot, { recursive: true, force: true })
}
