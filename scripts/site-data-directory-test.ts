import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const projectSource = readFileSync(
  join(root, 'src/render/components/LanguageProjects/Project.ts'),
  'utf8'
)
const startupSource = readFileSync(join(root, 'src/render/core/DataDirectoryStartup.ts'), 'utf8')
const ipcHandlerSource = readFileSync(join(root, 'src/main/core/IPCHandler.ts'), 'utf8')
const hostSource = readFileSync(join(root, 'src/render/util/Host.ts'), 'utf8')
const hostEditSource = readFileSync(join(root, 'src/render/components/Host/Edit.vue'), 'utf8')
const tomcatControllerSource = readFileSync(
  join(root, 'src/render/components/Host/Tomcat/TomcatSiteController.ts'),
  'utf8'
)

const setDirEnv = projectSource.slice(projectSource.indexOf('async setDirEnv'))
const addProject = projectSource.slice(projectSource.indexOf('  addProject()'))

assert.match(
  startupSource,
  /export const ensureDataDirectoryReady = async \(\): Promise<boolean>/,
  'data-directory writes need an explicit readiness result instead of waiting forever'
)
assert.match(
  startupSource,
  /IPC\.send\('application:data-directory-retry'\)/,
  'the first blocked site operation must retry the data-directory initialization'
)
assert.match(
  ipcHandlerSource,
  /case 'application:data-directory-retry':[\s\S]*?sendToMainWindow\(command, key, \{ code: 0, data: ready \}\)/,
  'the main process must return the retry result to the initiating renderer operation'
)
assert.ok(
  setDirEnv.indexOf('ensureDataDirectoryReady') >= 0 &&
    setDirEnv.indexOf('ensureDataDirectoryReady') < setDirEnv.indexOf('syncRoadRunnerConfigPort'),
  'language-project writes must be gated before touching project files'
)
assert.ok(
  addProject.indexOf('await this.setDirEnv(item)') >= 0 &&
    addProject.indexOf('await this.setDirEnv(item)') <
      addProject.indexOf('this.project.unshift(item)'),
  'a cancelled data-directory retry must not add a language project to persistence'
)
assert.match(
  hostSource,
  /ensureDataDirectoryReady\(\)/,
  'host-site creation must use the data-directory gate'
)
assert.match(
  hostEditSource,
  /if \(result !== false\) show\.value = false/,
  'cancelling the Helper prompt must keep the host editor open for a retry'
)
assert.match(
  tomcatControllerSource,
  /ensureDataDirectoryReady\(\)/,
  'Tomcat site creation must use the data-directory gate'
)

console.log('site data directory test passed')
