import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { buildPlugin } from './plugin-builder'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, readFile, rm, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import electron from 'electron'

const output = resolve('.superpowers/sdd/2026-11-03-flyenv-ai-memory/mcp-smoke')
await mkdir(output, { recursive: true })
const data = await mkdtemp(join(tmpdir(), 'flyenv-mcp-smoke-'))
const require = createRequire(import.meta.url)
const zip = require('7zip-min-electron')
const pack = (source: string, destination: string) =>
  new Promise<void>((yes, no) =>
    zip.pack(source, destination, (error: unknown) => (error ? no(error) : yes()))
  )
let child: ReturnType<typeof spawn> | undefined
let artifactServer: ReturnType<typeof createServer> | undefined
try {
  await buildPlugin('tests/fixtures/mcp-runtime', {
    outputRoot: join(output, 'package-v1'),
    archive: false
  })
  await cp(join(output, 'package-v1'), join(output, 'package-v2'), { recursive: true })
  const manifest = JSON.parse(await readFile(join(output, 'package-v2/plugin.json'), 'utf8'))
  manifest.version = '2.0.0'
  await writeFile(join(output, 'package-v2/plugin.json'), JSON.stringify(manifest))
  const forkCode = await readFile(join(output, 'package-v2/fork/index.mjs'), 'utf8')
  await writeFile(
    join(output, 'package-v2/fork/index.mjs'),
    forkCode.replaceAll('fixture-v1', 'fixture-v2')
  )
  const artifacts: Buffer[] = []
  for (const version of ['v1', 'v2']) {
    await rm(join(output, `${version}.zip`), { force: true })
    await pack(join(output, `package-${version}`), join(output, `${version}.zip`))
    artifacts.push(await readFile(join(output, `${version}.zip`)))
  }
  artifactServer = createServer((req, res) => {
    res.end(artifacts[req.url === '/v2.zip' ? 1 : 0])
  })
  await new Promise<void>((resolve) => artifactServer!.listen(0, '127.0.0.1', resolve))
  const artifactPort = (artifactServer.address() as any).port
  const portProbe = createServer()
  await new Promise<void>((resolve) => portProbe.listen(0, '127.0.0.1', resolve))
  const port = (portProbe.address() as any).port
  await new Promise<void>((resolve) => portProbe.close(() => resolve()))
  const nodeOptions: any = {
    platform: 'node',
    format: 'esm',
    bundle: true,
    packages: 'external',
    splitting: true,
    outExtension: { '.js': '.mjs' },
    loader: { '.node': 'file' }
  }
  await build({
    ...nodeOptions,
    entryPoints: {
      host: 'test/fixtures/plugin-mcp-runtime-smoke-host.ts',
      fork: 'src/fork/index.ts'
    },
    outdir: join(output, 'host'),
    chunkNames: 'chunks/[name]-[hash]'
  })
  await build({
    entryPoints: ['test/fixtures/plugin-mcp-runtime-smoke-renderer.ts'],
    outfile: join(output, 'renderer.js'),
    platform: 'browser',
    format: 'iife',
    bundle: true,
    define: {
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false'
    }
  })
  const preload = join(output, 'preload.cjs')
  await writeFile(
    preload,
    "const {contextBridge, ipcRenderer} = require('electron'); contextBridge.exposeInMainWorld('FlyEnvNodeAPI', { send: (command, key, ...args) => ipcRenderer.send('command', command, key, ...args), receive: callback => ipcRenderer.on('reply', (_event, ...args) => callback(...args)) });"
  )
  const html = join(output, 'index.html')
  await writeFile(
    html,
    '<!doctype html><html><body><div id="fixture"></div><script src="renderer.js"></script></body></html>'
  )
  const input = (index: number) => ({
    id: 'mcp-runtime-fixture',
    apiVersion: 2,
    version: index === 0 ? '1.0.0' : '2.0.0',
    url: `http://127.0.0.1:${artifactPort}/v${index + 1}.zip`,
    sha256: createHash('sha256').update(artifacts[index]).digest('hex')
  })
  await writeFile(
    join(data, 'options.json'),
    JSON.stringify({
      html,
      preload,
      port,
      v1: input(0),
      v2: input(1),
      staticPath: resolve('static'),
      forkFile: join(output, 'host/fork.mjs')
    })
  )
  const env: NodeJS.ProcessEnv = { ...process.env, FLYENV_DATA_ROOT: data }
  delete env.ELECTRON_RUN_AS_NODE
  child = spawn(electron as unknown as string, [join(output, 'host/host.mjs')], {
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let log = ''
  child.stdout!.on('data', (bytes) => {
    log += String(bytes)
  })
  child.stderr!.on('data', (bytes) => {
    log += String(bytes)
  })
  await new Promise<void>((yes, no) => {
    const timer = setTimeout(() => {
      child!.kill('SIGKILL')
      no(new Error('MCP runtime smoke timed out'))
    }, 55_000)
    child!.once('error', (error) => {
      clearTimeout(timer)
      no(error)
    })
    child!.once('exit', () => {
      clearTimeout(timer)
      yes()
    })
  }).finally(() => writeFile(join(output, 'host.log'), log))
  const result = JSON.parse(await readFile(join(data, 'result.json'), 'utf8'))
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2))
  assert.equal(result.ok, true, JSON.stringify(result))
  console.log(JSON.stringify(result))
} finally {
  if (child && child.exitCode === null) child.kill('SIGKILL')
  await new Promise<void>((resolve) =>
    artifactServer ? artifactServer.close(() => resolve()) : resolve()
  )
  await rm(data, { recursive: true, force: true })
}
