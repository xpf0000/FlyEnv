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
assert.match(globalIpc, /APP-Windows-Elevation-Method-Changed/)
assert.match(helperStore, /import \{ dirname, join \} from '@\/util\/path-browserify'/)
assert.match(
  helperStore,
  /const item = join\(dirname\(exePath\), 'resources\/helper\/flyenv-helper\.exe'\)/
)
assert.equal(english.windowsElevationMethod, 'Elevation Method')
assert.equal(chinese.windowsElevationMethod, '提权方式')

console.log('windows elevation method test passed')
