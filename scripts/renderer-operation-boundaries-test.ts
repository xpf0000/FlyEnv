import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import type { SoftInstalled } from '../src/shared/app'
import { redisCommanderRequest } from '../src/render/components/Redis/RedisCommanderRequest'

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
  .map((path) => relative(componentsDir, path).split(sep).join('/'))
  .sort()

assert.deepEqual(actualDirectIpcIndexPages, legacyDirectIpcIndexPages)
assert.match(agentsSource, /## Module Boundaries and Operation Ownership/)
assert.match(agentsSource, /UI state belongs to the mounted Vue component only/)
assert.match(
  agentsSource,
  /Existing shared domain state belongs to Pinia or the established module store/
)
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
assert.doesNotMatch(packageJson.scripts?.build ?? '', /test:renderer-operation-boundaries/)

const aiSessionModules = [
  { directory: 'ClaudeCode', setup: 'ClaudeCodeSetup', forkKey: 'claudeCode' },
  { directory: 'Codex', setup: 'CodexSetup', forkKey: 'codex' },
  { directory: 'OpenCode', setup: 'OpenCodeSetup', forkKey: 'openCode' },
  { directory: 'CopilotCli', setup: 'CopilotCliSetup', forkKey: 'copilotCli' },
  { directory: 'Kimi', setup: 'KimiSetup', forkKey: 'kimi' },
  { directory: 'Antigravity', setup: 'AntigravitySetup', forkKey: 'antigravity' }
]

for (const module of aiSessionModules) {
  const pageSource = readFileSync(join(componentsDir, module.directory, 'Sessions.vue'), 'utf-8')
  const setupSource = readFileSync(join(componentsDir, module.directory, 'setup.ts'), 'utf-8')
  const setupDeleteStart = setupSource.indexOf('deleteSessions(sessionIds: string[])')
  const setupTerminalStart = setupSource.indexOf('startSessionInTerminal(workDir: string)')
  const setupDeleteSource = setupSource.slice(setupDeleteStart, setupTerminalStart)

  assert.match(pageSource, /const selectedSessionIds = ref\(new Set<string>\(\)\)/)
  assert.match(pageSource, /const visibleSessionIds = computed\(/)
  assert.match(pageSource, /const deleteSelectedSessions = \(\) =>/)
  assert.match(pageSource, /<template #title>/)
  assert.match(pageSource, /terminal\.svg\?raw/)
  assert.match(pageSource, new RegExp(`${module.setup}\\.deleteSessions\\(ids\\)`))
  assert.match(pageSource, /@click\.stop="startSessionInTerminal\(group\.workDir\)"/)
  assert.match(pageSource, new RegExp(`${module.setup}\\.startSessionInTerminal\\(workDir\\)`))
  assert.doesNotMatch(pageSource, /from\s+['"]@\/util\/IPC['"]/)

  assert.match(setupSource, /deletingSessions = false/)
  assert.match(setupSource, /openingSessionDirs = new Set<string>\(\)/)
  assert.match(setupSource, /deleteSessions\(sessionIds: string\[\]\): Promise<string\[\]>/)
  assert.match(
    setupSource,
    new RegExp(`IPC\\.send\\('app-fork:${module.forkKey}', 'deleteSessions', ids\\)`)
  )
  assert.match(setupSource, /startSessionInTerminal\(workDir: string\): Promise<boolean>/)
  assert.match(
    setupSource,
    new RegExp(`IPC\\.send\\('app-fork:${module.forkKey}', 'runInTerminal', workDir\\)`)
  )
  assert.match(setupSource, /isStartingSessionInTerminal\(workDir: string\)/)
  assert.match(setupDeleteSource, /this\.refreshSessions\(\)/)
  assert.equal((setupDeleteSource.match(/this\.refreshSessions\(\)/g) ?? []).length, 1)
}

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
assert.ok(skillSource.trim().split(/\s+/).length <= 600)

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
    className: 'ChUiPanel',
    stateName: 'opening',
    defaultExport: /export\s+default\s+new\s+[A-Za-z0-9_]+\(\)/
  },
  {
    page: 'MongoDB/Index.vue',
    controller: 'MongoDB/DbGatePanel.ts',
    instance: 'dbGatePanel',
    className: 'DbGatePanel',
    stateName: 'opening',
    defaultExport: /export\s+default\s+new\s+[A-Za-z0-9_]+\(\)/
  },
  {
    page: 'PostgreSql/Index.vue',
    controller: 'PostgreSql/PgAdminPanel.ts',
    instance: 'pgAdminPanel',
    className: 'PgAdminPanel',
    stateName: 'opening',
    defaultExport: /export\s+default\s+new\s+[A-Za-z0-9_]+\(\)/
  },
  {
    page: 'Redis/Index.vue',
    controller: 'Redis/RedisCommanderPanel.ts',
    instance: 'redisCommanderPanel',
    className: 'RedisCommanderPanel',
    stateName: 'opening',
    defaultExport: /export\s+default\s+new\s+[A-Za-z0-9_]+\(\)/
  },
  {
    page: 'Neo4j/Index.vue',
    controller: 'Neo4j/controller.ts',
    instance: 'neo4jController',
    className: 'Neo4jController',
    stateName: 'opening',
    defaultExport: /export\s+default\s+new\s+[A-Za-z0-9_]+\(\)/
  },
  {
    page: 'Host/Tomcat/Edit.vue',
    controller: 'Host/Tomcat/TomcatSiteController.ts',
    instance: 'tomcatSiteController',
    className: 'TomcatSiteController',
    stateName: 'saving',
    stateDeclaration: /saving = false/,
    defaultExport: /export\s+default\s+reactiveBind\(new\s+TomcatSiteController\(\)\)/
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
  assert.match(
    controllerSource,
    registration.stateDeclaration ??
      new RegExp(`readonly ${registration.stateName} = ref\\(false\\)`)
  )
  assert.doesNotMatch(controllerSource, /markRaw\(\s*new TomcatSiteSaveOperation/)
  assert.match(controllerSource, registration.defaultExport)
}

const redisPage = readFileSync(join(componentsDir, 'Redis/Index.vue'), 'utf-8')
const redisPanel = readFileSync(join(componentsDir, 'Redis/RedisCommanderPanel.ts'), 'utf-8')
const redisCommanderOpenRequest = redisCommanderRequest(
  { bin: '/tmp/node', rootPassword: 'node-secret' } as SoftInstalled,
  { version: '7.4.0', rootPassword: 'redis-secret' } as SoftInstalled
)
assert.deepEqual(redisCommanderOpenRequest, {
  node: { bin: '/tmp/node' },
  redis: { version: '7.4.0' }
})
assert.doesNotMatch(JSON.stringify(redisCommanderOpenRequest), /node-secret|redis-secret/)
assert.match(redisPage, /<template v-if="isRunning" #tool-left>/)
assert.match(redisPage, /:disabled="redisCommanderOpening \|\| !redisCommanderNodeAvailable"/)
assert.match(redisPanel, /IPC\.sendSensitive\('app-fork:redis', 'openRedisCommander'/)
assert.match(redisPanel, /redisCommanderRequest\(node, redis\)/)
assert.match(redisPanel, /isWebPanelInstallNotice/)
assert.match(redisPanel, /shell\.openExternal\(res\.data\.url\)/)
assert.doesNotMatch(redisPage, /from\s+['"]@\/util\/IPC['"]/)
assert.doesNotMatch(redisPage, /requirepass|RedisDir|readFile|redisCommanderConfig/)
assert.doesNotMatch(redisPanel, /requirepass|RedisDir|readFile|redisCommanderConfig/)

console.log('renderer operation boundary tests passed')
