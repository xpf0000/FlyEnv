import { createServer } from 'vite'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import electron from 'electron'
import viteConfig from '../configs/vite.config'
import { buildLanguageAssets } from './build-language-assets'
import { buildPlugin } from './plugin-builder'
const output = resolve('.superpowers/sdd/2026-11-03-flyenv-ai-memory/app-smoke')
await mkdir(output, { recursive: true })
await rm(join(output, 'result.json'), { force: true })
const root = await mkdtemp(join(tmpdir(), 'flyenv-memory-app-'))
const server = await createServer({
  ...viteConfig.serverConfig,
  configFile: false,
  server: { port: 0, host: '127.0.0.1', strictPort: true }
})
let child: ReturnType<typeof spawn> | undefined
try {
  await server.listen()
  const port = (server.httpServer!.address() as any).port
  await cp('static', 'dist/electron/static', { recursive: true })
  await buildLanguageAssets({
    sourceRoot: resolve('src/lang'),
    outputRoot: resolve('dist/electron/static/lang')
  })
  await buildPlugin('ai-memory', { outputRoot: join(output, 'package'), archive: false })
  await build({
    platform: 'node',
    format: 'esm',
    bundle: true,
    packages: 'external',
    splitting: true,
    outExtension: { '.js': '.mjs' },
    outdir: resolve('dist/electron'),
    entryPoints: {
      'memory-app-smoke': 'test/fixtures/ai-memory-app-smoke-host.ts',
      fork: 'src/fork/index.ts'
    },
    plugins: [
      {
        name: 'isolated-vite-port',
        setup(ctx) {
          ctx.onResolve({ filter: /configs\/vite\.port$/ }, () => ({
            path: 'port',
            namespace: 'memory-test'
          }))
          ctx.onLoad({ filter: /.*/, namespace: 'memory-test' }, () => ({
            contents: `export const ViteDevPort = ${port}`,
            loader: 'ts'
          }))
        }
      }
    ]
  })
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FLYENV_DATA_ROOT: root,
    FLYENV_PLUGIN_PATH: join(output, 'package'),
    MEMORY_SMOKE_OUTPUT: output,
    MEMORY_SMOKE_REPO: process.cwd()
  }
  delete env.ELECTRON_RUN_AS_NODE
  child = spawn(electron as unknown as string, [resolve('dist/electron/memory-app-smoke.mjs')], {
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let log = ''
  child.stdout!.on('data', (chunk) => {
    log += String(chunk)
  })
  child.stderr!.on('data', (chunk) => {
    log += String(chunk)
  })
  await new Promise<void>((yes, no) => {
    const timer = setTimeout(() => {
      child?.kill('SIGKILL')
      no(new Error('app smoke timeout'))
    }, 210_000)
    child!.once('error', no)
    child!.once('exit', () => {
      clearTimeout(timer)
      yes()
    })
  }).finally(() => writeFile(join(output, 'app.log'), log))
  const result = JSON.parse(await readFile(join(output, 'result.json'), 'utf8'))
  console.log(JSON.stringify(result))
  if (!result.ok) process.exitCode = 1
} finally {
  if (child && child.exitCode === null) child.kill('SIGKILL')
  await server.close()
  await rm(root, { recursive: true, force: true })
}
