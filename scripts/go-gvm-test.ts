import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  isGvmVersionIdentifier,
  mergeGvmVersionData,
  parseGvmAvailableVersions,
  parseGvmInstalledVersions,
  quotePosixShell
} from '../src/shared/Gvm'
import {
  fetchGvmVersionData,
  findGvmGoDirectories,
  gvmInitScript,
  resolveGvmRoot
} from '../src/fork/module/GoLang/gvm'

const availableOutput = `
gvm gos (available)

   go1.24.4
   go1.24.5
   release.r60.3
   weekly.2012-03-13
   go1.24.5;touch /tmp/not-allowed
`

assert.deepEqual(parseGvmAvailableVersions(availableOutput), [
  'go1.24.4',
  'go1.24.5',
  'release.r60.3',
  'weekly.2012-03-13'
])

const installedOutput = `
gvm gos (installed)

   go1.23.9
=> go1.24.5
`

assert.deepEqual(parseGvmInstalledVersions(installedOutput), [
  { name: 'go1.23.9', isDefault: false },
  { name: 'go1.24.5', isDefault: true }
])

assert.deepEqual(mergeGvmVersionData(availableOutput, installedOutput), [
  { name: 'go1.24.4', version: '1.24.4', installed: false, isDefault: false },
  { name: 'go1.24.5', version: '1.24.5', installed: true, isDefault: true },
  {
    name: 'release.r60.3',
    version: 'release.r60.3',
    installed: false,
    isDefault: false
  },
  {
    name: 'weekly.2012-03-13',
    version: 'weekly.2012-03-13',
    installed: false,
    isDefault: false
  },
  { name: 'go1.23.9', version: '1.23.9', installed: true, isDefault: false }
])

assert.equal(isGvmVersionIdentifier('go1.24.5'), true)
assert.equal(isGvmVersionIdentifier('release.r60.3'), true)
assert.equal(isGvmVersionIdentifier('weekly.2012-03-13'), true)
assert.equal(isGvmVersionIdentifier('gvm'), false)
assert.equal(isGvmVersionIdentifier('go1.24.5;rm'), false)
assert.equal(
  quotePosixShell("/Users/Test O'Neil/.gvm/scripts/gvm"),
  "'/Users/Test O'\\''Neil/.gvm/scripts/gvm'"
)

assert.equal(resolveGvmRoot(' /custom/gvm ', '/Users/test'), '/custom/gvm')
assert.equal(resolveGvmRoot('', '/Users/test'), '/Users/test/.gvm')
assert.equal(gvmInitScript('/Users/test/.gvm'), '/Users/test/.gvm/scripts/gvm')

const temporaryHome = await mkdtemp(join(tmpdir(), 'flyenv-go-gvm-'))
try {
  const gvmRoot = join(temporaryHome, '.gvm')
  await mkdir(join(gvmRoot, 'gos', 'go1.23.9'), { recursive: true })
  await mkdir(join(gvmRoot, 'gos', 'go1.24.5'), { recursive: true })
  assert.deepEqual(await findGvmGoDirectories(gvmRoot), [
    join(gvmRoot, 'gos', 'go1.23.9'),
    join(gvmRoot, 'gos', 'go1.24.5')
  ])
  assert.deepEqual(await findGvmGoDirectories(join(temporaryHome, 'missing')), [])
} finally {
  await rm(temporaryHome, { recursive: true, force: true })
}

const gvmCommands: string[] = []
const gvmData = await fetchGvmVersionData(
  "/Users/Test O'Neil/.gvm/scripts/gvm",
  async (command) => {
    gvmCommands.push(command)
    return {
      stdout: command.endsWith('gvm listall')
        ? 'gvm gos (available)\n   go1.24.5\n'
        : 'gvm gos (installed)\n=> go1.24.5\n'
    }
  }
)
assert.deepEqual(gvmCommands, [
  "source '/Users/Test O'\\''Neil/.gvm/scripts/gvm' && gvm listall",
  "source '/Users/Test O'\\''Neil/.gvm/scripts/gvm' && gvm list"
])
assert.deepEqual(gvmData, [
  { name: 'go1.24.5', version: '1.24.5', installed: true, isDefault: true }
])

const goLangSource = readFileSync('src/fork/module/GoLang/index.ts', 'utf8')
assert.match(goLangSource, /findGvmGoDirectories/)
assert.match(goLangSource, /checkGvm\(\)/)
assert.match(goLangSource, /gvmData\(\)/)
assert.match(goLangSource, /fetchGvmVersionData/)

console.log('go gvm tests passed')
