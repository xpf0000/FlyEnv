import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as helpers from '../src/fork/module/Postgresql/pgAdmin'

const ensurePip = helpers.ensurePgAdminPip
assert.equal(typeof ensurePip, 'function', 'pgAdmin must repair a venv without pip')

async function scenario(pipPresent: boolean, bootstrapProbe: string, failure?: string) {
  const commands: string[][] = []
  const downloads: string[] = []
  const run = async (args: string[]) => {
    commands.push(args)
    if (args[1] === 'pip') {
      if (!pipPresent) throw new Error('No module named pip')
      return { stdout: 'pip 25.0' }
    }
    if (args[0] === '-c') return { stdout: bootstrapProbe }
    if (failure) throw new Error(failure)
    pipPresent = true
    return { stdout: '' }
  }
  const bootstrap = async (url: string) => {
    downloads.push(url)
    if (failure) throw new Error(failure)
    pipPresent = true
  }
  return { commands, downloads, execute: () => ensurePip({ run, bootstrap }) }
}

const healthy = await scenario(true, 'ensurepip')
await healthy.execute()
assert.deepEqual(healthy.commands, [['-m', 'pip', '--version']])
assert.deepEqual(healthy.downloads, [])

const bundled = await scenario(false, 'ensurepip')
await bundled.execute()
assert.deepEqual(bundled.commands[2], ['-m', 'ensurepip', '--upgrade', '--default-pip'])
assert.deepEqual(bundled.commands.at(-1), ['-m', 'pip', '--version'])
assert.deepEqual(bundled.downloads, [])

for (const version of ['3.9.21', '3.11.2', '3.13.1']) {
  const missingEnsurepip = await scenario(false, version)
  await missingEnsurepip.execute()
  assert.deepEqual(missingEnsurepip.downloads, [
    version.startsWith('3.9.')
      ? 'https://bootstrap.pypa.io/pip/3.9/get-pip.py'
      : 'https://bootstrap.pypa.io/get-pip.py'
  ])
  assert.deepEqual(missingEnsurepip.commands.at(-1), ['-m', 'pip', '--version'])
}

for (const probe of ['ensurepip', '3.11.2']) {
  const failed = await scenario(false, probe, 'bootstrap failed')
  await assert.rejects(failed.execute(), /bootstrap failed/)
  assert.equal(failed.commands.length, probe === 'ensurepip' ? 3 : 2)
  if (probe === 'ensurepip') assert.deepEqual(failed.downloads, [])
}

await assert.rejects(
  ensurePip({
    run: async (args) => {
      if (args[0] === '-c') return { stdout: 'ensurepip' }
      if (args[1] === 'ensurepip') return { stdout: '' }
      throw new Error('pip is still unavailable')
    },
    bootstrap: async () => assert.fail('ensurepip is available')
  }),
  /pip is still unavailable/
)

const source = readFileSync('src/fork/module/Postgresql/index.ts', 'utf-8')
assert.match(source, /\['-m', 'venv', '--without-pip', paths\.venv\]/)
assert.match(source, /if \(!existsSync\(paths\.python\)\)/)
const repair = source.slice(source.indexOf('if (!packageRoot) {'))
const ensureIndex = repair.indexOf('await ensurePgAdminPip(')
const installIndex = repair.indexOf("['-m', 'pip', 'install'")
assert.notEqual(ensureIndex, -1)
assert.notEqual(installIndex, -1)
assert.ok(ensureIndex < installIndex)
assert.match(repair, /spawnPromiseWithEnv\(paths\.python, args, \{ shell: false \}\)/)
assert.match(repair, /await writeFile\(bootstrapFile, data\)/)
assert.match(repair, /spawnPromiseWithEnv\(\s*paths\.python,\s*\[bootstrapFile,/)
assert.doesNotMatch(source, /remove\(paths\.(?:root|data|log|venv)\)/)
console.log('pgAdmin pip bootstrap regression tests passed')
