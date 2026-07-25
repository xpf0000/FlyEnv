import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const application = fs.readFileSync(path.resolve('src/main/Application.ts'), 'utf8')
const serverManager = fs.readFileSync(path.resolve('src/main/core/ServerManager.ts'), 'utf8')

assert.match(serverManager, /WindowsElevationMethod = resolveWindowsElevationMethod/)
assert.match(application, /App-Windows-Elevation-Method-Fallback/)
assert.match(application, /APP-Windows-Elevation-Method-Changed/)
assert.match(application, /message.state === 'installFaild'/)
assert.match(application, /message.state === 'fallbackToUac'/)
assert.match(application, /this.serverManager.updateGlobalConfig/)

const common = fs.readFileSync(path.resolve('src/render/components/Setup/Common.vue'), 'utf8')
const control = fs.readFileSync(
  path.resolve('src/render/components/Setup/WindowsElevationMethod/index.vue'),
  'utf8'
)
const globalIpc = fs.readFileSync(path.resolve('src/render/util/GlobalIPCOn.ts'), 'utf8')
const helperStore = fs.readFileSync(path.resolve('src/render/store/helper.ts'), 'utf8')
const nodeFn = fs.readFileSync(path.resolve('src/render/util/NodeFn.ts'), 'utf8')
const appNodeFn = fs.readFileSync(path.resolve('src/main/core/AppNodeFn.ts'), 'utf8')
const english = JSON.parse(fs.readFileSync(path.resolve('src/lang/en/setup.json'), 'utf8'))
const chinese = JSON.parse(fs.readFileSync(path.resolve('src/lang/zh/setup.json'), 'utf8'))

assert.match(common, /<WindowsElevationMethod \/>/)
assert.match(
  common,
  /<div v-if="isWindows" class="row-2">\s*<div class="col">\s*<WindowsElevationMethod \/>\s*<\/div>\s*<div class="col"><\/div>\s*<\/div>/
)
assert.match(control, /value="uac"/)
assert.match(control, /value="helper"/)
assert.match(control, /APP-FlyEnv-Helper-Install/)
assert.match(control, /HelperStore\.beginInstall\(\)/)
assert.match(control, /HelperStore\.completeInstall\(res\)/)
assert.match(globalIpc, /APP-Windows-Elevation-Method-Changed/)
assert.match(
  globalIpc,
  /!res\?\.status &&\s*!HelperStore\.isInstallResultPending\(\) &&\s*HelperStore\.shouldShowNeedInstallDialog/
)
assert.match(helperStore, /beginInstall\(\)/)
assert.match(helperStore, /completeInstall\(res: any\)/)
assert.match(helperStore, /app\.getWindowsHelperBinaryPath\(\)/)
assert.doesNotMatch(helperStore, /app\.getPath\('exe'\)/)
assert.match(
  nodeFn,
  /getWindowsHelperBinaryPath: createIPCCall<\[\], string>\('app', 'getWindowsHelperBinaryPath'\)/
)
assert.match(appNodeFn, /app_getWindowsHelperBinaryPath\(/)
assert.equal(english.windowsElevationMethod, 'Elevation Method')
assert.equal(chinese.windowsElevationMethod, '提权方式')

console.log('windows elevation method test passed')
