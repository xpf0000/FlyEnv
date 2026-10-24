import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import type { SoftInstalled } from '../src/shared/app'
import {
  resolvePgAdminPython,
  selectPgAdminPython
} from '../src/render/components/PostgreSql/PgAdminPython'
import { redisCommanderRequest } from '../src/render/components/Redis/RedisCommanderRequest'

const root = join(import.meta.dirname, '..')
const componentsDir = join(root, 'src', 'render', 'components')
const agentsSource = readFileSync(join(root, 'AGENTS.md'), 'utf-8')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const englishCommon = JSON.parse(
  readFileSync(join(root, 'src', 'lang', 'en', 'common.json'), 'utf-8')
)
const chineseCommon = JSON.parse(
  readFileSync(join(root, 'src', 'lang', 'zh', 'common.json'), 'utf-8')
)

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

const phpWindowsPage = readFileSync(join(componentsDir, 'PHP/Extension/Windows/index.vue'), 'utf-8')
const phpWindowsController = readFileSync(
  join(componentsDir, 'PHP/Extension/Windows/controller.ts'),
  'utf-8'
)
assert.doesNotMatch(phpWindowsPage, /from\s+['"]@\/util\/IPC['"]|IPC\.send/)
assert.match(phpWindowsPage, /windowsExtensions\.install\(version,/)
assert.match(phpWindowsPage, /windowsExtensions\.disable\(version,/)
assert.match(phpWindowsController, /reactiveBind\(\s*new WindowsExtensionController/)

const loadedPhpSetup = readFileSync(join(componentsDir, 'PHP/Extension/Loaded/setup.ts'), 'utf-8')
const loadedPhpPage = readFileSync(join(componentsDir, 'PHP/Extension/Loaded/index.vue'), 'utf-8')
assert.match(loadedPhpSetup, /reactiveBind\(\s*new LoadedExtensionsController/)
assert.doesNotMatch(loadedPhpSetup, /exec\.exec|IPC\.send|LoadedSetup\.reFetch\s*=/)
assert.match(loadedPhpPage, /v-if="error"/)

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
  {
    directory: 'ClaudeCode',
    setup: 'ClaudeCodeSetup',
    forkKey: 'claudeCode',
    lastSessionCommand: "`${resolveAiCliTerminalCommand('claude')} --continue`"
  },
  {
    directory: 'Codex',
    setup: 'CodexSetup',
    forkKey: 'codex',
    lastSessionCommand: "`${resolveAiCliTerminalCommand('codex')} resume --last`"
  },
  {
    directory: 'OpenCode',
    setup: 'OpenCodeSetup',
    forkKey: 'openCode',
    lastSessionCommand: "`${resolveAiCliTerminalCommand('opencode')} --continue`"
  },
  {
    directory: 'CopilotCli',
    setup: 'CopilotCliSetup',
    forkKey: 'copilotCli',
    lastSessionCommand: "`${resolveAiCliTerminalCommand('copilot')} --continue`"
  },
  {
    directory: 'Kimi',
    setup: 'KimiSetup',
    forkKey: 'kimi',
    lastSessionCommand: "`${resolveAiCliTerminalCommand('kimi')} --continue`"
  },
  {
    directory: 'Antigravity',
    setup: 'AntigravitySetup',
    forkKey: 'antigravity',
    lastSessionCommand: "`${resolveAiCliTerminalCommand('agy')} --continue`"
  }
]

for (const module of aiSessionModules) {
  const pageSource = readFileSync(join(componentsDir, module.directory, 'Sessions.vue'), 'utf-8')
  const setupSource = readFileSync(join(componentsDir, module.directory, 'setup.ts'), 'utf-8')
  const forkSource = readFileSync(
    join(root, 'src', 'fork', 'module', module.directory, 'index.ts'),
    'utf-8'
  )
  const setupDeleteStart = setupSource.indexOf('deleteSessions(sessionIds: string[])')
  const setupTerminalStart = setupSource.indexOf('startSessionInTerminal(workDir: string)')
  const setupDeleteSource = setupSource.slice(setupDeleteStart, setupTerminalStart)

  assert.match(pageSource, /const selectedSessionIds = ref\(new Set<string>\(\)\)/)
  assert.match(pageSource, /const visibleSessionIds = computed\(/)
  assert.match(pageSource, /const deleteSelectedSessions = \(\) =>/)
  assert.match(pageSource, /<template #title>/)
  assert.match(pageSource, /class="min-w-0 flex-1 truncate"/)
  assert.match(pageSource, /class="ml-auto flex shrink-0 gap-2"/)
  assert.match(pageSource, /class="ml-3 !text-lg"/)
  assert.match(pageSource, new RegExp(`${module.setup}\\.deleteSessions\\(ids\\)`))
  assert.match(pageSource, /terminal\.svg\?raw/)
  assert.match(pageSource, /RefreshLeft/)
  assert.match(pageSource, /class="!ml-0 mr-3"/)
  assert.match(pageSource, /class="w-\[16px\] h-\[16px\]"/)
  assert.match(pageSource, /<RefreshLeft class="w-\[16px\] h-\[16px\]"\s*\/>/)
  assert.doesNotMatch(pageSource, /:icon="RefreshLeft"/)
  assert.doesNotMatch(pageSource, /<el-icon class="w-\[16px\] h-\[16px\]"/)
  assert.match(pageSource, /<el-tooltip\s*:content="I18nT\('common\.session\.newSession'\)"/)
  assert.match(pageSource, /<el-tooltip\s*:content="I18nT\('common\.session\.lastSession'\)"/)
  assert.match(pageSource, /I18nT\('common\.session\.newSession'\)/)
  assert.match(pageSource, /I18nT\('common\.session\.lastSession'\)/)
  assert.match(pageSource, /@click\.stop="startSessionInTerminal\(group\.workDir\)"/)
  assert.match(pageSource, /@click\.stop="resumeLastSessionInTerminal\(group\.workDir\)"/)
  assert.doesNotMatch(pageSource, /group\.sessions\[0\]/)
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
  assert.match(setupSource, /resumeLastSessionInTerminal\(workDir: string\): Promise<boolean>/)
  assert.match(
    setupSource,
    new RegExp(
      `IPC\\.send\\('app-fork:${module.forkKey}', 'resumeLastSessionInTerminal', workDir\\)`
    )
  )
  assert.match(forkSource, /resumeLastSessionInTerminal\(workDir: string\)/)
  assert.ok(forkSource.includes(module.lastSessionCommand))
  assert.match(setupDeleteSource, /this\.refreshSessions\(\)/)
  assert.equal((setupDeleteSource.match(/this\.refreshSessions\(\)/g) ?? []).length, 1)
}

assert.equal(englishCommon.session.newSession, 'New Session')
assert.equal(englishCommon.session.lastSession, 'Last Session')
assert.equal(chineseCommon.session.newSession, '新会话')
assert.equal(chineseCommon.session.lastSession, '上次会话')

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

const pgAdminPanelSource = readFileSync(join(componentsDir, 'PostgreSql/PgAdminPanel.ts'), 'utf-8')
assert.match(pgAdminPanelSource, /resolvePgAdminPython\(/)
assert.doesNotMatch(pgAdminPanelSource, /currentVersion\('python'\)/)
assert.match(pgAdminPanelSource, /ServiceActionStore\.isInAppEnv\(candidate\)/)
assert.match(pgAdminPanelSource, /\(\) => ServiceActionStore\.fetchPath\(\)/)
assert.ok(
  pgAdminPanelSource.indexOf('this.opening.value = true') <
    pgAdminPanelSource.indexOf('await resolvePgAdminPython(')
)

const serviceActionStoreSource = readFileSync(
  join(componentsDir, 'ServiceManager/EXT/store.ts'),
  'utf-8'
)
assert.match(serviceActionStoreSource, /fetchPath: \(\) => Promise<void>/)
assert.match(serviceActionStoreSource, /const FETCH_PATH_TIMEOUT_MS = 20_000/)
assert.match(serviceActionStoreSource, /const FETCH_PATH_COOLDOWN_MS = 60_000/)
assert.match(serviceActionStoreSource, /setTimeout\(settle, FETCH_PATH_TIMEOUT_MS\)/)
assert.match(
  serviceActionStoreSource,
  /setTimeout\(\(\) => \{\s*ServiceActionStore\.fetchPathing = false\s*\}, FETCH_PATH_COOLDOWN_MS\)/
)
assert.match(serviceActionStoreSource, /ServiceActionStore\.fetchPathing = false/)

const redisPage = readFileSync(join(componentsDir, 'Redis/Index.vue'), 'utf-8')
const redisPanel = readFileSync(join(componentsDir, 'Redis/RedisCommanderPanel.ts'), 'utf-8')
const pgAdminPythonCandidates = [
  { version: '3.14.3', bin: 'C:/FlyEnv/python-3.14/python.exe', path: 'C:/FlyEnv/python-3.14' },
  { version: '3.13.15', bin: 'C:/FlyEnv/python-3.13/python.exe', path: 'C:/FlyEnv/python-3.13' },
  { version: '3.9.13', bin: 'C:/FlyEnv/python-3.9/python.exe', path: 'C:/FlyEnv/python-3.9' }
]
assert.equal(
  selectPgAdminPython(pgAdminPythonCandidates, (candidate) => candidate.version === '3.13.15')
    ?.version,
  '3.13.15'
)
assert.equal(
  selectPgAdminPython(pgAdminPythonCandidates, (candidate) => candidate.version === '3.14.3')
    ?.version,
  '3.13.15'
)
assert.equal(
  selectPgAdminPython([pgAdminPythonCandidates[0]], () => false),
  undefined
)
assert.equal(
  selectPgAdminPython([pgAdminPythonCandidates[2], pgAdminPythonCandidates[1]], () => false)
    ?.version,
  '3.13.15'
)
const initiallyUnfetchedPythonModule: {
  installed: typeof pgAdminPythonCandidates
  fetchInstalled: (retryDataDirectory?: boolean) => Promise<boolean>
} = {
  installed: [],
  async fetchInstalled(retryDataDirectory) {
    assert.equal(retryDataDirectory, true)
    this.installed = [...pgAdminPythonCandidates]
    return true
  }
}
let pgAdminEnvPathsReady = false
assert.equal(
  (
    await resolvePgAdminPython(
      initiallyUnfetchedPythonModule,
      (candidate) => pgAdminEnvPathsReady && candidate.version === '3.9.13',
      async () => {
        pgAdminEnvPathsReady = true
      }
    )
  )?.version,
  '3.9.13'
)
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
assert.match(redisPage, /:disabled="redisCommanderOpening"/)
assert.doesNotMatch(redisPage, /redisCommanderNodeAvailable/)
assert.match(redisPanel, /await brewStore\.module\('node'\)\.fetchInstalled\(true\)/)
assert.ok(
  redisPanel.indexOf('this.opening.value = true') <
    redisPanel.indexOf("await brewStore.module('node').fetchInstalled(true)")
)
assert.match(redisPanel, /IPC\.sendSensitive\('app-fork:redis', 'openRedisCommander'/)
assert.match(redisPanel, /redisCommanderRequest\(node, redis\)/)
assert.match(redisPanel, /isWebPanelInstallNotice/)
assert.match(redisPanel, /shell\.openExternal\(res\.data\.url\)/)
assert.doesNotMatch(redisPage, /from\s+['"]@\/util\/IPC['"]/)
assert.doesNotMatch(redisPage, /requirepass|RedisDir|readFile|redisCommanderConfig/)
assert.doesNotMatch(redisPanel, /requirepass|RedisDir|readFile|redisCommanderConfig/)

const languageProjectSource = readFileSync(
  join(componentsDir, 'LanguageProjects/Project.ts'),
  'utf-8'
)
const appNodeFnSource = readFileSync(join(root, 'src/main/core/AppNodeFn.ts'), 'utf-8')
const nodeFnSource = readFileSync(join(root, 'src/render/util/NodeFn.ts'), 'utf-8')
const shellInitControllerSource = readFileSync(
  join(componentsDir, 'Tools/ShellInitController.ts'),
  'utf-8'
)
assert.match(
  languageProjectSource,
  /import ShellInitController from '@\/components\/Tools\/ShellInitController'/
)
assert.doesNotMatch(languageProjectSource, /from\s+['"]@\/util\/IPC['"]/)
assert.match(languageProjectSource, /ShellInitController\.ensure\(\)/)
assert.match(languageProjectSource, /\[LanguageProjects\]\[setDirEnv\]\[timing\]/)
assert.match(languageProjectSource, /ensure-data-directory-ready/)
assert.match(languageProjectSource, /sync-roadrunner-config-port/)
assert.match(languageProjectSource, /write-project-env-file/)
assert.match(languageProjectSource, /save-project-directories/)
assert.match(languageProjectSource, /initialize-project-directories/)
assert.match(languageProjectSource, /initialize-shell-hook/)
assert.match(languageProjectSource, /import \{ debug, fs, shell \} from '@\/util\/NodeFn'/)
assert.match(languageProjectSource, /debug\s*\.log\(/)
assert.match(
  languageProjectSource,
  /logSetDirEnvTiming\(\{ event: 'step', \.\.\.context, step, durationMs \}\)/
)
assert.match(
  nodeFnSource,
  /export const debug = \{\s*log: createIPCCall<\[string, string\], void>\('debug', 'log'\)/
)
assert.match(
  appNodeFnSource,
  /debug_log\(command: string, key: string, flag: string, info: string\)/
)
assert.match(appNodeFnSource, /appDebugLog\(flag, info\)/)
assert.match(shellInitControllerSource, /export class ShellInitController\b/)
assert.match(
  shellInitControllerSource,
  /private inFlight\?: Promise<FlyEnvShellInitResult \| undefined>/
)
assert.match(shellInitControllerSource, /response\?\.code === 200/)
assert.match(shellInitControllerSource, /IPC\.off\(key\)/)

const phpCreateControllerPath = join(
  componentsDir,
  'Host',
  'CreateProject',
  'PhpProjectCreateController.ts'
)
const phpCreateControllerSource = existsSync(phpCreateControllerPath)
  ? readFileSync(phpCreateControllerPath, 'utf-8')
  : ''
const phpCreateSource = readFileSync(
  join(componentsDir, 'Host', 'CreateProject', 'phpCreate.vue'),
  'utf-8'
)
const phpCreateWindowsSource = readFileSync(
  join(componentsDir, 'Host', 'CreateProject', 'phpCreate.win.vue'),
  'utf-8'
)
const projectSetupSource = readFileSync(
  join(componentsDir, 'Host', 'CreateProject', 'project.ts'),
  'utf-8'
)
const phpFormStart = projectSetupSource.indexOf('export type ProjectPHPForm')
const nodeFormStart = projectSetupSource.indexOf('export type ProjectNodeJSForm')
const phpFormSource = projectSetupSource.slice(phpFormStart, nodeFormStart)

assert.equal(existsSync(phpCreateControllerPath), true)
assert.match(phpCreateSource, /from ['"]\.\/PhpProjectCreateController['"]/)
assert.match(phpCreateWindowsSource, /from ['"]\.\/PhpProjectCreateController['"]/)
assert.doesNotMatch(phpCreateSource, /mv \.\/\* \.\.\//)
assert.doesNotMatch(phpCreateSource, /from ['"]@\/util\/XTerm['"]/)
assert.doesNotMatch(phpCreateWindowsSource, /from ['"]@\/util\/XTerm['"]/)
assert.doesNotMatch(phpCreateWindowsSource, /from ['"]@\/util\/IPC['"]/)
assert.doesNotMatch(phpCreateWindowsSource, /from ['"]@\/util\/Element['"]/)
assert.doesNotMatch(phpFormSource, /\brunning:/)
assert.doesNotMatch(phpFormSource, /\bcreated:/)
assert.doesNotMatch(phpFormSource, /\bcreateFail:/)
assert.doesNotMatch(projectSetupSource, /execing\.PHP/)
assert.match(phpCreateControllerSource, /export class PhpProjectCreateController\b/)
assert.match(phpCreateControllerSource, /import IPC from '@\/util\/IPC'/)
assert.match(phpCreateControllerSource, /import \{ reactiveBind \} from '@\/util\/Index'/)
assert.match(phpCreateControllerSource, /import \{ markRaw \} from 'vue'/)
assert.match(phpCreateControllerSource, /import XTerm from '@\/util\/XTerm'/)
assert.match(phpCreateControllerSource, /import \{ MessageError \} from '@\/util\/Element'/)
assert.match(phpCreateControllerSource, /markRaw\(new XTerm\(\)\)/)
assert.match(phpCreateControllerSource, /IPC\.send\('app-fork:project', 'handleProjectDir'/)
assert.match(phpCreateControllerSource, /response\?\.code === 200/)
assert.match(phpCreateControllerSource, /IPC\.off\(key\)/)
assert.match(
  phpCreateControllerSource,
  /export default reactiveBind\(new PhpProjectCreateController\(\)\)/
)
assert.ok(
  phpCreateControllerSource.indexOf('await terminal.send(commands, false)') <
    phpCreateControllerSource.indexOf("IPC.send('app-fork:project', 'handleProjectDir'")
)

// 权限页只能绑定控制器；IPC、进度、超时清理与版本保护必须由单例所有。
const privilegeDir = join(componentsDir, 'Setup', 'WindowsElevationMethod')
const privilegeController = readFileSync(join(privilegeDir, 'Controller.ts'), 'utf-8')
for (const filename of ['Choice.vue', 'index.vue']) {
  const page = readFileSync(join(privilegeDir, filename), 'utf-8')
  assert.doesNotMatch(page, /IPC\.send\(/)
}
assert.match(privilegeController, /reactiveBind\(new WindowsPrivilegeController\(\)\)/)
assert.match(privilegeController, /result\?\.code === 200/)
assert.match(privilegeController, /IPC\.off\(key\)/)
assert.match(privilegeController, /private operation\?: Promise<void>/)
assert.match(privilegeController, /snapshot\.revision < /)

const openSearchDir = join(root, 'plugins', 'opensearch', 'render')
const openSearchDashboardsPage = readFileSync(join(openSearchDir, 'Index.vue'), 'utf-8')
const openSearchDashboardsController = readFileSync(
  join(openSearchDir, 'DashboardsPanel.ts'),
  'utf-8'
)
assert.doesNotMatch(openSearchDashboardsPage, /IPC\.send\(/)
assert.match(openSearchDashboardsPage, /installed\.find\(\(item\) =>/)
assert.match(openSearchDashboardsPage, /item\.run &&/)
assert.match(openSearchDashboardsPage, /!item\.running &&/)
assert.match(openSearchDashboardsPage, /dashboardsPanel\.open\(runningVersion\)/)
assert.match(openSearchDashboardsController, /export class OpenSearchDashboardsPanel\b/)
assert.match(openSearchDashboardsController, /response\?\.code === 200/)
assert.match(openSearchDashboardsController, /ipc\.off\(request\.key\)/)
assert.match(openSearchDashboardsController, /private operation\?: Promise<void>/)
assert.match(openSearchDashboardsController, /maxTimeoutMs/)
assert.match(openSearchDashboardsController, /shell\.openExternal/)

const llamaRuntimePage = readFileSync(
  join(root, 'plugins/llamacpp/render/runtime/Index.vue'),
  'utf-8'
)
const llamaController = readFileSync(join(root, 'plugins/llamacpp/render/controller.ts'), 'utf-8')
assert.doesNotMatch(llamaRuntimePage, /from\s+['"]@\/util\/IPC['"]|#footer/)
assert.match(llamaRuntimePage, /LlamaCppManager\.getRuntimeOperation\(variant\)/)
assert.match(llamaRuntimePage, /LlamaCppManager\.getRuntimeOperation\(runtime\.path\)/)
assert.match(llamaRuntimePage, /LlamaCppManager\.installRuntime\(row\.variant\)/)
assert.match(llamaController, /runtimeOperations: Record<string, OperationState>/)
const llamaModelsPage = readFileSync(
  join(root, 'plugins/llamacpp/render/models/Index.vue'),
  'utf-8'
)
assert.match(llamaModelsPage, /LlamaCppManager\.refreshLocalModels\(\)/)
assert.doesNotMatch(llamaModelsPage, /['"]inspectLocalModelFiles['"]/)
assert.match(llamaController, /private catalogueFlight\?: Promise<void>/)
assert.match(llamaController, /ipc\.off\(key\)/)
const llamaLaunchOwner = readFileSync(
  join(root, 'plugins/llamacpp/render/launchController.ts'),
  'utf8'
)
const llamaAside = readFileSync(join(root, 'plugins/llamacpp/render/aside.vue'), 'utf8')
for (const name of [
  'Index.vue',
  'settings/ModelSettings.vue',
  'settings/ServiceSettings.vue',
  'settings/CommandPreview.vue'
]) {
  const page = readFileSync(join(root, 'plugins/llamacpp/render', name), 'utf8')
  assert.doesNotMatch(page, /from\s+['"]@\/util\/IPC['"]|ipc\.send|defineStore\(/)
}
assert.match(llamaAside, /startExtParam/)
assert.match(llamaController, /startParameters\(version/)
assert.match(llamaController, /withLaunchInput/)
assert.match(llamaLaunchOwner, /class ModuleMutationGate/)
assert.match(llamaLaunchOwner, /clone\(input\)/)
assert.match(llamaLaunchOwner, /service\.restart\(\)/)
assert.match(llamaLaunchOwner, /generation === this\.generation/)
assert.doesNotMatch(llamaController, /config\.setup|defineStore\(/)

const mssqlPage = readFileSync(join(root, 'plugins/mssql/render/Index.vue'), 'utf8')
const mssqlController = readFileSync(join(root, 'plugins/mssql/render/store.ts'), 'utf8')
assert.doesNotMatch(mssqlPage, /IPC\.send\(/)
assert.doesNotMatch(mssqlPage, /developerEditionNote|with-eula/)
assert.match(mssqlPage, /MssqlManager\.onlineVersions\.filter/)
const mssqlDialog = readFileSync(join(root, 'plugins/mssql/render/SetupDialog.vue'), 'utf8')
assert.doesNotMatch(mssqlDialog, /eula|developerEditionNote/i)
assert.doesNotMatch(mssqlController, /fs\.remove\(/)
assert.match(mssqlController, /private operations = new Map/)
assert.match(mssqlController, /res\?\.code === 200/)
assert.match(mssqlController, /IPC\.off\(request\.key\)/)
assert.match(mssqlPage, /#action="\{ row \}"/)
assert.match(mssqlPage, /v-if="isWindows"/)
assert.match(mssqlPage, /MssqlManager\.openConfigurationManager\(row\)/)
assert.match(mssqlController, /private configurationManagerRequest\?: Promise<boolean>/)
assert.match(mssqlPage, /MssqlManager\.repairPermissions\(row\)/)
assert.match(mssqlController, /private permissionRepairs = new Map/)
assert.doesNotMatch(
  readFileSync(join(root, 'plugins/mssql/render/log/setup.ts'), 'utf8'),
  /allowElevation|readFileByRoot/
)
const mssqlLogs = readFileSync(join(root, 'plugins/mssql/render/Logs.vue'), 'utf8')
assert.match(mssqlLogs, /<LogVM v-else ref="log" :log-file="filepath"/)
assert.match(mssqlLogs, /<WindowsLogVM v-if="isWindows"/)
assert.doesNotMatch(mssqlLogs, /IPC\.send|<pre|<el-select/)
assert.match(mssqlLogs, /<ToolVM :log="log"/)
assert.doesNotMatch(mssqlController, /readWindowsLog|logWatcher|windowsLog =/)

const damengPage = readFileSync(join(root, 'plugins/dameng/render/Index.vue'), 'utf8')
const shortcutsDir = join(root, 'plugins/command-shortcuts/render')
const shortcutsPage = readFileSync(join(shortcutsDir, 'Index.vue'), 'utf8')
const shortcutsController = readFileSync(join(shortcutsDir, 'controller.ts'), 'utf8')
const shortcutsManager = readFileSync(join(shortcutsDir, 'manager.ts'), 'utf8')
const shortcutsCard = readFileSync(join(shortcutsDir, 'FolderCard.vue'), 'utf8')
assert.doesNotMatch(shortcutsPage, /from\s+['"]@\/util\/IPC['"]/)
assert.doesNotMatch(shortcutsPage, /<el-table/)
assert.doesNotMatch(shortcutsCard, /from\s+['"]@\/util\/IPC['"]/)
assert.match(shortcutsCard, /manager\.run\(folder\.id, preset\.id\)/)
assert.match(shortcutsPage, /manager\.reorderFolders\(/)
assert.match(shortcutsCard, /manager\.reorderCommands\(/)
assert.match(shortcutsCard, /manager\.openFolderTerminal\(folder\.id\)/)
assert.match(shortcutsCard, /manager\.openFolderPath\(folder\.id\)/)
assert.match(shortcutsController, /async openFolderTerminal\(folderId: string\)/)
assert.match(shortcutsController, /async openFolderPath\(folderId: string\)/)
assert.match(shortcutsController, /class CommandShortcutsController/)
assert.match(shortcutsController, /status: 'opening' \| 'opened' \| 'failed'/)
assert.match(shortcutsController, /this\.isOpening\(commandId\)/)
assert.match(shortcutsController, /await this\.deps\.launch\(/)
assert.match(shortcutsManager, /reactiveBind\(/)
assert.match(shortcutsManager, /forkTerminalRequest\(/)
assert.match(shortcutsManager, /StorageGetAsync/)
assert.match(shortcutsManager, /StorageSetAsync/)
assert.doesNotMatch(shortcutsManager, /defineStore|config\.setup/)
const damengController = readFileSync(join(root, 'plugins/dameng/render/store.ts'), 'utf8')
assert.doesNotMatch(damengPage, /IPC\.send|config\.setup|activeStates|role="status"/)
assert.match(damengPage, /<InstallDialog ref="installDialog"/)
const damengInstallDialog = readFileSync(
  join(root, 'plugins/dameng/render/InstallDialog.vue'),
  'utf8'
)
assert.doesNotMatch(damengInstallDialog, /IPC\.send|dialog\.showOpenDialog|config\.setup/)
assert.match(damengInstallDialog, /DamengManager\.chooseInstallDirectory/)
assert.match(damengInstallDialog, /DamengManager\.install/)
assert.match(damengInstallDialog, /#append/)
assert.match(damengInstallDialog, /installDirectoryRule/)
assert.match(damengController, /private operations = new Map/)
assert.match(damengController, /response\?\.code === 200/)
assert.match(damengController, /IPC\.off\(request\.key\)/)
assert.match(damengController, /IPC\.send\(/)
assert.doesNotMatch(damengController, /sendSensitive|serviceControlsSupported/)
assert.match(damengController, /StorageSetAsync/)
assert.doesNotMatch(damengController, /defineStore|fs\.remove/)
assert.match(damengController, /validateInstallPath/)
assert.match(damengController, /dialog\.showOpenDialog/)
assert.match(damengController, /setup\.dameng/)
assert.doesNotMatch(damengPage, /show-custom-dir|show-delete|hostUpdateRequired/)
const damengSetup = readFileSync(join(root, 'plugins/dameng/render/SetupDialog.vue'), 'utf8')
assert.match(damengController, /private startRequests = new Map/)
assert.match(damengController, /getInitializationState/)
assert.match(damengController, /showSetupDialog/)
assert.doesNotMatch(damengSetup, /IPC\.send|\.start\(/)
assert.match(damengSetup, /el-scrollbar/)
assert.match(damengSetup, /height: 75vh/)
assert.match(damengSetup, /generateInitialPassword/)
const damengSetupPrompt = readFileSync(join(root, 'plugins/dameng/render/setup.ts'), 'utf8')
assert.match(damengSetupPrompt, /AsyncComponentShow/)
const damengLogs = readFileSync(join(root, 'plugins/dameng/render/Logs.vue'), 'utf8')
assert.match(damengLogs, /<LogVM ref="log"/)
assert.match(damengLogs, /<ToolVM :log="log"/)
assert.doesNotMatch(damengLogs, /IPC\.send|<pre/)

console.log('renderer operation boundary tests passed')
