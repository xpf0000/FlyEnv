import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SoftInstalled } from '../src/shared/app'
import { neo4jStartCommand } from '../src/fork/module/Neo4j/start-command'

const root = join(import.meta.dirname, '..')
const controller = readFileSync(join(root, 'src/render/components/Neo4j/controller.ts'), 'utf-8')
const item = readFileSync(join(root, 'src/render/core/Module/ModuleInstalledItem.ts'), 'utf-8')
const setup = readFileSync(join(root, 'src/render/components/ServiceManager/setup.ts'), 'utf-8')
const brew = readFileSync(join(root, 'src/render/store/brew.ts'), 'utf-8')
const appTypes = readFileSync(join(root, 'src/shared/app.d.ts'), 'utf-8')
const aside = readFileSync(join(root, 'src/render/components/Neo4j/aside.vue'), 'utf-8')
const neo4jStore = readFileSync(join(root, 'src/render/components/Neo4j/store.ts'), 'utf-8')

// Neo4j must use the shared ModuleInstalledItem lifecycle. Its Java binding and
// instance directory are supplied through the module extension parameters.
assert.doesNotMatch(
  item,
  /this\.typeFlag\s*===\s*['"]neo4j['"]/,
  'ModuleInstalledItem must not have a Neo4j-specific lifecycle branch'
)
assert.doesNotMatch(item, /javaHome\?|javaMajor\?|neo4jInstanceDir\?/)
assert.doesNotMatch(appTypes, /javaHome\?|javaMajor\?|neo4jInstanceDir\?/)
assert.match(item, /module\?\.startExtParam/)
assert.match(item, /module\?\.stopExtParam/)
assert.match(
  setup,
  /case 'start':[\s\S]{0,80}action = item\.start\(\)/,
  'ServiceManager must use the shared item.start method for Neo4j'
)
assert.match(
  setup,
  /case 'stop':[\s\S]{0,80}action = item\.stop\(\)/,
  'ServiceManager must use the shared item.stop method for Neo4j'
)
assert.match(brew, /module\.watchShowHide\(\)/, 'BrewStore must keep module setup generic')
assert.doesNotMatch(brew, /neo4jParams|neo4jStopParams|Neo4jManager/)
assert.match(aside, /Neo4jManager\.startParams/)
assert.match(aside, /Neo4jManager\.stopParams/)
assert.match(neo4jStore, /instanceDirFor\(/)
assert.doesNotMatch(controller, /startInternal|stopInternal|stopOtherVersions/)

const nativeVersion = { bin: '/opt/neo4j/bin/neo4j' } as SoftInstalled
assert.deepEqual(
  neo4jStartCommand(nativeVersion, false, () => false, 'powershell.exe'),
  { bin: nativeVersion.bin, execArgs: ['console'] }
)

const windowsVersion = { bin: join('neo4j', 'bin', 'neo4j.bat') } as SoftInstalled
const expectedPowerShellScript = join('neo4j', 'bin', 'neo4j.ps1')
assert.deepEqual(
  neo4jStartCommand(
    windowsVersion,
    true,
    (scriptPath) => scriptPath === expectedPowerShellScript,
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
  ),
  {
    bin: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    execArgs: [
      '-NoProfile',
      '-NonInteractive',
      '-NoLogo',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-File',
      expectedPowerShellScript,
      'console'
    ]
  }
)

const percentPathVersion = {
  bin: 'C:\\Neo4j\\%NEO4J_HOME%\\bin\\neo4j.bat'
} as SoftInstalled
assert.deepEqual(
  neo4jStartCommand(percentPathVersion, true, () => false, 'powershell.exe'),
  {
    bin: 'cmd.exe',
    execArgs: ['/d', '/s', '/c', '"%FLYENV_NEO4J_BIN%" console'],
    execEnv: { FLYENV_NEO4J_BIN: percentPathVersion.bin }
  }
)

const neo4jFork = readFileSync(join(root, 'src/fork/module/Neo4j/index.ts'), 'utf-8')
assert.match(neo4jFork, /import \{ neo4jStartCommand \} from '\.\/start-command'/)
assert.match(
  neo4jFork,
  /neo4jStartCommand\(\s*version,\s*isWindows\(\),\s*existsSync,\s*EnvSync\.PowerShellPath \|\| 'powershell\.exe'\s*\)/
)
assert.match(
  neo4jFork,
  /serviceStartSpawn\(\{[\s\S]{0,1000}bin: command\.bin,[\s\S]{0,100}execArgs: command\.execArgs,[\s\S]{0,300}execEnv: \{[\s\S]{0,300}command\.execEnv/
)

console.log('Neo4j service lifecycle tests passed')
