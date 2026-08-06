import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'

const root = join(import.meta.dirname, '..')
const componentsDir = join(root, 'src', 'render', 'components')
const agentsSource = readFileSync(join(root, 'AGENTS.md'), 'utf-8')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))

const walk = (dir: string): string[] => {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

const legacyDirectIpcIndexPages = [
  'Aside/Index.vue',
  'Host/Index.vue',
  'Temporal/Index.vue',
  'Tools/BomClean/Index.vue',
  'Tools/PhpObfuscator/Index.vue',
  'Tools/PortKill/Index.vue',
  'Tools/ProcessKill/Index.vue',
  'Tools/SSLMake/Index.vue',
  'Tools/SiteSucker/Index.vue',
  'Tools/SystenEnv/Index.vue'
]

const actualDirectIpcIndexPages = walk(componentsDir)
  .filter((path) => basename(path) === 'Index.vue')
  .filter((path) => /from\s+['"]@\/util\/IPC['"]/.test(readFileSync(path, 'utf-8')))
  .map((path) => relative(componentsDir, path))
  .sort()

assert.deepEqual(actualDirectIpcIndexPages, legacyDirectIpcIndexPages)
assert.match(agentsSource, /## Module Boundaries and Operation Ownership/)
assert.match(agentsSource, /UI state belongs to the mounted Vue component only/)
assert.match(agentsSource, /Domain state belongs to Pinia or the established module store/)
assert.match(
  agentsSource,
  /Long-running renderer operations belong to a module-local singleton controller/
)
assert.match(
  agentsSource,
  /Fork modules own child processes, PID\/port state, and companion shutdown/
)
assert.match(agentsSource, /generic loading-state map cannot replace a controller/)
assert.match(agentsSource, /\.codex\/skills\/flyenv-module-boundaries\/SKILL\.md/)

assert.equal(
  packageJson.scripts?.['test:renderer-operation-boundaries'],
  'tsx scripts/renderer-operation-boundaries-test.ts'
)
assert.match(packageJson.scripts?.build ?? '', /^yarn test:renderer-operation-boundaries && /)

const skillPath = join(root, '.codex', 'skills', 'flyenv-module-boundaries', 'SKILL.md')
assert.equal(existsSync(skillPath), true)
const skillSource = readFileSync(skillPath, 'utf-8')
assert.match(skillSource, /^---\nname: flyenv-module-boundaries\n/m)
assert.match(skillSource, /^description: Use when /m)
assert.match(skillSource, /AGENTS\.md/)
assert.match(skillSource, /view, domain, renderer operation, or fork process state/)
assert.match(skillSource, /module-local singleton controller/)
assert.match(
  skillSource,
  /duplicate invocation, progress retention, terminal cleanup, and page re-entry/
)
assert.doesNotMatch(skillSource, /TODO|TBD/)
assert.ok(skillSource.trim().split(/\s+/).length <= 500)

const skillMetadataPath = join(
  root,
  '.codex',
  'skills',
  'flyenv-module-boundaries',
  'agents',
  'openai.yaml'
)
assert.equal(existsSync(skillMetadataPath), true)

const controllers = [
  {
    page: 'ClickHouse/Index.vue',
    controller: 'ClickHouse/ChUiPanel.ts',
    instance: 'chUiPanel',
    className: 'ChUiPanel'
  },
  {
    page: 'MongoDB/Index.vue',
    controller: 'MongoDB/DbGatePanel.ts',
    instance: 'dbGatePanel',
    className: 'DbGatePanel'
  },
  {
    page: 'PostgreSql/Index.vue',
    controller: 'PostgreSql/PgAdminPanel.ts',
    instance: 'pgAdminPanel',
    className: 'PgAdminPanel'
  },
  {
    page: 'Redis/Index.vue',
    controller: 'Redis/RedisCommanderPanel.ts',
    instance: 'redisCommanderPanel',
    className: 'RedisCommanderPanel'
  }
]

for (const registration of controllers) {
  const pageSource = readFileSync(join(componentsDir, registration.page), 'utf-8')
  const controllerSource = readFileSync(join(componentsDir, registration.controller), 'utf-8')
  const controllerName = basename(registration.controller, '.ts')

  assert.match(
    pageSource,
    new RegExp(`import\\s+${registration.instance}\\s+from\\s+['"]\\./${controllerName}['"]`)
  )
  assert.doesNotMatch(pageSource, /from\s+['"]@\/util\/IPC['"]/)
  assert.match(controllerSource, new RegExp(`export\\s+class\\s+${registration.className}\\b`))
  assert.match(controllerSource, /readonly opening = ref\(false\)/)
  assert.match(controllerSource, /export default new [A-Za-z0-9_]+\(\)/)
}

const redisPage = readFileSync(join(componentsDir, 'Redis/Index.vue'), 'utf-8')
const redisPanel = readFileSync(join(componentsDir, 'Redis/RedisCommanderPanel.ts'), 'utf-8')
assert.match(redisPage, /<template v-if="isRunning" #tool-left>/)
assert.match(redisPage, /:disabled="redisCommanderOpening \|\| !redisCommanderNodeAvailable"/)
assert.match(redisPanel, /IPC\.sendSensitive\('app-fork:redis', 'openRedisCommander'/)
assert.match(redisPanel, /isWebPanelInstallNotice/)
assert.match(redisPanel, /shell\.openExternal\(res\.data\.url\)/)
assert.doesNotMatch(redisPage, /from\s+['"]@\/util\/IPC['"]/)
assert.doesNotMatch(redisPage, /requirepass|RedisDir|readFile|redisCommanderConfig/)
assert.doesNotMatch(redisPanel, /requirepass|RedisDir|readFile|redisCommanderConfig/)

console.log('renderer operation boundary tests passed')
