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

console.log('windows elevation method test passed')
