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
  quotePosixShell,
  sortGvmVersionsNewestFirst
} from '../src/shared/Gvm'
import {
  fetchGvmVersionData,
  findGvmGoDirectories,
  gvmInitScript,
  resolveGvmRoot
} from '../src/fork/module/GoLang/gvm'
import {
  GVM_INSTALL_COMMAND,
  buildGvmVersionCommand
} from '../src/render/components/GoLang/gvm/command'
import { appendGvmTab } from '../src/render/components/GoLang/tabs'

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

const unsortedVersions = [
  { name: 'go1.22.9', version: '1.22.9', installed: true, isDefault: true },
  { name: 'go1.24.5', version: '1.24.5', installed: false, isDefault: false },
  { name: 'go1.23.10', version: '1.23.10', installed: false, isDefault: false }
]
assert.deepEqual(
  sortGvmVersionsNewestFirst(unsortedVersions).map((item) => item.name),
  ['go1.24.5', 'go1.23.10', 'go1.22.9']
)
assert.deepEqual(
  unsortedVersions.map((item) => item.name),
  ['go1.22.9', 'go1.24.5', 'go1.23.10']
)

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

assert.equal(
  GVM_INSTALL_COMMAND,
  'bash < <(curl -sSL https://raw.githubusercontent.com/moovweb/gvm/master/binscripts/gvm-installer)'
)
assert.equal(
  buildGvmVersionCommand('/Users/test/.gvm/scripts/gvm', 'install', 'go1.24.5'),
  "source '/Users/test/.gvm/scripts/gvm' && gvm install go1.24.5 -B"
)
assert.equal(
  buildGvmVersionCommand('/Users/test/.gvm/scripts/gvm', 'uninstall', 'go1.23.9'),
  "source '/Users/test/.gvm/scripts/gvm' && gvm uninstall go1.23.9"
)
assert.equal(
  buildGvmVersionCommand('/Users/test/.gvm/scripts/gvm', 'default', 'go1.24.5'),
  "source '/Users/test/.gvm/scripts/gvm' && gvm use go1.24.5 --default"
)
assert.throws(
  () => buildGvmVersionCommand('/Users/test/.gvm/scripts/gvm', 'install', 'go1.24;rm'),
  /Invalid GVM version/
)

const baseTabs = ['projects', 'service', 'versions', 'new-project']
assert.deepEqual(appendGvmTab(baseTabs, true), baseTabs)
assert.deepEqual(appendGvmTab(baseTabs, false), [...baseTabs, 'GVM'])
assert.deepEqual(baseTabs, ['projects', 'service', 'versions', 'new-project'])

const goLangSource = readFileSync('src/fork/module/GoLang/index.ts', 'utf8')
assert.match(goLangSource, /findGvmGoDirectories/)
assert.match(goLangSource, /checkGvm\(\)/)
assert.match(goLangSource, /gvmData\(\)/)
assert.match(goLangSource, /fetchGvmVersionData/)

const goIndexSource = readFileSync('src/render/components/GoLang/Index.vue', 'utf8')
assert.match(goIndexSource, /<GvmVM v-else-if="tab === 4" \/>/)
assert.match(goIndexSource, /import GvmVM from '\.\/gvm\/index\.vue'/)
assert.match(goIndexSource, /appendGvmTab\(/)
assert.match(goIndexSource, /window\.Server\.isWindows === true/)

const gvmSetupSource = readFileSync('src/render/components/GoLang/gvm/setup.ts', 'utf8')
assert.match(gvmSetupSource, /IPC\.send\('app-fork:golang', 'checkGvm'\)/)
assert.match(gvmSetupSource, /IPC\.send\('app-fork:golang', 'gvmData'\)/)
assert.match(gvmSetupSource, /buildGvmVersionCommand/)
assert.match(gvmSetupSource, /GVM_INSTALL_COMMAND/)
assert.match(gvmSetupSource, /module\.installedFetched = false/)
assert.doesNotMatch(gvmSetupSource, /\.then\([\s\S]*?\)\s*\.catch\(/)
assert.match(gvmSetupSource, /await xterm\.send\(params, false\)/)

const gvmPageSource = readFileSync('src/render/components/GoLang/gvm/index.vue', 'utf8')
assert.match(gvmPageSource, /GvmSetup\.installGvm/)
assert.match(gvmPageSource, /GvmSetup\.versionAction/)
assert.match(gvmPageSource, /setVersionDefault/)
assert.match(gvmPageSource, /sortGvmVersionsNewestFirst\(list\)/)
assert.match(gvmPageSource, /scope\.row\.installed && !scope\.row\.isDefault/)

console.log('go gvm tests passed')
