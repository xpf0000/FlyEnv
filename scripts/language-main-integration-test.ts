import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const launcher = readFileSync('src/main/Launcher.ts', 'utf8')
const application = readFileSync('src/main/Application.ts', 'utf8')
const configManager = readFileSync('src/main/core/ConfigManager.ts', 'utf8')
const ipcHandler = readFileSync('src/main/core/IPCHandler.ts', 'utf8')

assert.match(launcher, /await application\.init\(\)/)
assert.match(application, /new LanguageRepository/)
assert.match(application, /new LanguageCoordinator/)
assert.match(application, /async init\(\)/)
assert.doesNotMatch(configManager, /AppI18n/)
assert.match(ipcHandler, /application:language-bootstrap/)
assert.match(ipcHandler, /application:language-prepare/)
assert.match(ipcHandler, /application:language-commit/)
console.log('language main integration tests passed')
