import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const devRunner = readFileSync('scripts/dev-runner.ts', 'utf8')
const appBuilder = readFileSync('scripts/app-builder.ts', 'utf8')

assert.match(devRunner, /buildLanguageAssets/)
assert.match(devRunner, /src\/lang/)
assert.match(appBuilder, /buildLanguageAssets/)
assert.match(appBuilder, /dist\/electron\/static\/lang/)
console.log('language build hook tests passed')
