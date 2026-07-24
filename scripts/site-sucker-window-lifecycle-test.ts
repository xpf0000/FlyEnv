import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('src/main/ui/SiteSucker/PageTask.ts', 'utf8')
const constructorSource = source.slice(
  source.indexOf('constructor('),
  source.indexOf('async updateConfig')
)
const headersHandlerSource = constructorSource.slice(
  constructorSource.indexOf('onHeadersReceived'),
  constructorSource.length
)
const pageTaskSource = source.slice(source.indexOf('class PageTask {'))

assert.equal(
  constructorSource.match(/\.once\('closed'/g)?.length,
  1,
  'each SiteSucker window must register exactly one closed listener during construction'
)
assert.doesNotMatch(
  headersHandlerSource,
  /\.on\('close'/,
  'response handling must not register additional window close listeners'
)
assert.match(
  source,
  /private handleWindowClosed = \(\) => \{[\s\S]*?this\.onDestroyed\(this\)/,
  'window cleanup must notify the task manager through one shared finalizer'
)
assert.match(
  source,
  /destroy\(\) \{[\s\S]*?if \(this\.destroyed\) \{[\s\S]*?return[\s\S]*?window\.destroy\(\)[\s\S]*?this\.handleWindowClosed\(\)/,
  'window destruction must be idempotent and finalize even if Electron does not emit synchronously'
)
assert.match(
  pageTaskSource,
  /destroy\(\) \{[\s\S]*?const task = \[\.\.\.this\.task\][\s\S]*?task\.forEach\(\(t\) => t\.destroy\(\)\)/,
  'destroying the SiteSucker task manager must destroy every BrowserWindow'
)

console.log('SiteSucker window lifecycle tests passed')
