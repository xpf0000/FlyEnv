import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(root, path), 'utf-8')

const store = read('src/render/components/Neo4j/store.ts')
const controller = read('src/render/components/Neo4j/controller.ts')
const index = read('src/render/components/Neo4j/Index.vue')
const config = read('src/render/components/Neo4j/Config.vue')
const logs = read('src/render/components/Neo4j/Logs.vue')
const service = read('src/render/components/ServiceManager/index.vue')

assert.match(store, /export class Neo4jJavaBindingManager\b/)
assert.match(store, /reactiveBind\(new Neo4jJavaBindingManager\(/)
assert.match(store, /StorageGetAsync/)
assert.match(store, /StorageSetAsync/)
assert.doesNotMatch(store, /defineStore\(/)
assert.doesNotMatch(store, /from ['"]@\/store\/app['"]/)
assert.doesNotMatch(store, /neo4jJavaBindings/)
assert.match(store, /getBinding\(/)
const getBindingBody = store.match(
  /getBinding\([^)]*\): Neo4jJavaBinding \| undefined \{([\s\S]*?)\n\s{2}\}\n\n\s{2}async setBinding/
)
assert.ok(getBindingBody, 'getBinding implementation must be found')
assert.doesNotMatch(
  getBindingBody[1],
  /ensureHydrated|Object\.assign|this\.javaByBin\s*=/,
  'getBinding must stay read-only because it is called from the table render path'
)
assert.match(store, /setBinding\(/)
assert.match(store, /reconcileBindings\(/)
assert.match(store, /mutationQueue/)
assert.match(controller, /export class Neo4jController\b/)
assert.match(controller, /readonly opening = ref\(false\)/)
assert.match(controller, /startService/)
assert.match(controller, /stopService/)
assert.match(controller, /sendSensitive/)
assert.match(controller, /export default new Neo4jController\(\)/)
assert.match(index, /<template #column="\{ row \}">/)
assert.match(index, /candidatesForVersion/)
assert.match(index, /Neo4jManager\.init\(\)/)
assert.doesNotMatch(index, /neo4jStore/)
assert.doesNotMatch(index, /from\s+['"]@\/util\/IPC['"]/)
assert.match(config, /initConfig/)
assert.match(logs, /getLogFiles/)
assert.match(service, /<slot name="column" :row="scope\.row">/)

console.log('Neo4j renderer tests passed')
