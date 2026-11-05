import { build } from 'esbuild'
import { mkdtemp, mkdir, readFile, writeFile, rm, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import electron from 'electron'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { createPackageWithOptions } from '@electron/asar'
import { createRequire } from 'node:module'

const output = resolve('.superpowers/sdd/2026-11-03-flyenv-ai-memory/runtime-probe')
await mkdir(output, { recursive: true })
const dataRoot = await mkdtemp(join(tmpdir(), 'flyenv-memory-native-'))
for (const name of ['host', 'worker'])
  await build({
    entryPoints: [`test/fixtures/plugin-memory-runtime-probe-${name}.ts`],
    outfile: join(output, `${name}.mjs`),
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external'
  })
const resultFile = join(output, 'result.json')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
function launch(result: string, mode = '', codeRoot = output) {
  const child = spawn(
    electron as unknown as string,
    [join(codeRoot, 'host.mjs'), join(codeRoot, 'worker.mjs'), dataRoot, result, mode],
    { env, stdio: ['ignore', 'pipe', 'pipe'] }
  )
  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)
  const exited = new Promise<number | null>((resolveExit, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('probe host timeout'))
    }, 30_000)
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', (code) => {
      clearTimeout(timeout)
      resolveExit(code)
    })
  })
  return { child, exited }
}
async function readReady(path: string) {
  for (let i = 0; i < 100; i++) {
    try {
      return JSON.parse(await readFile(path, 'utf8'))
    } catch {
      await delay(50)
    }
  }
  throw new Error('probe did not publish ready marker')
}
assert.equal(await launch(resultFile).exited, 0)
const summary = JSON.parse(await readFile(resultFile, 'utf8'))
const holderFile = join(output, 'holder.json')
await rm(holderFile, { force: true })
const holder = launch(holderFile, 'orphan-holder')
const owner = await readReady(holderFile)
assert.equal(owner.acquired, true)
holder.child.kill('SIGKILL')
await holder.exited
const contenderFile = join(output, 'contender.json')
assert.equal(await launch(contenderFile, 'try-once').exited, 0)
const contender = JSON.parse(await readFile(contenderFile, 'utf8'))
if (!contender.acquired) assert.equal(contender.code, 'owner_busy')
summary.hostCrash = { survivingWorkerBlockedReplacement: !contender.acquired, workerPid: owner.pid }
// Only this probe's known child is eligible for cleanup; never discover/kill application workers.
try {
  process.kill(owner.pid, 'SIGKILL')
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
}
const afterFile = join(output, 'after-crash.json')
assert.equal(await launch(afterFile, 'try-once').exited, 0)
assert.equal(JSON.parse(await readFile(afterFile, 'utf8')).acquired, true)

const packaged = join(output, 'package')
await mkdir(join(packaged, 'node_modules'), { recursive: true })
for (const name of ['host.mjs', 'worker.mjs']) await cp(join(output, name), join(packaged, name))
const require = createRequire(import.meta.url)
const addonPackage = require.resolve('fs-native-extensions/package.json')
const dependencies = [
  'fs-native-extensions',
  'require-addon',
  'which-runtime',
  'bare-addon-resolve',
  'bare-module-resolve',
  'bare-semver'
]
const addonRequire = createRequire(addonPackage)
for (const name of dependencies) {
  let packageRoot = resolve(addonRequire.resolve(name), '..')
  while (
    JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8').catch(() => '{}')).name !==
    name
  ) {
    const parent = resolve(packageRoot, '..')
    if (parent === packageRoot) throw new Error('Dependency package root not found')
    packageRoot = parent
  }
  await cp(packageRoot, join(packaged, 'node_modules', name), {
    recursive: true,
    dereference: true
  })
}
await createPackageWithOptions(packaged, join(output, 'app.asar'), { unpack: '**/*.node' })
const packedResult = join(output, 'packaged-result.json')
assert.equal(await launch(packedResult, '', join(output, 'app.asar')).exited, 0)
summary.packagedAsar = JSON.parse(await readFile(packedResult, 'utf8')).passed
await writeFile(resultFile, JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
await rm(dataRoot, { recursive: true, force: true })
