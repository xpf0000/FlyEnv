import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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

console.log('Neo4j service lifecycle tests passed')
