import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const workflow = readFileSync(join(root, '.github/workflows/macos-version-build.yml'), 'utf8')
const electronBuilderVersion = require('electron-builder/package.json').version
const appBuilderLibVersion = require('app-builder-lib/package.json').version

const versionParts = (version: string) => version.split('.').map(Number)
const isAtLeast = (version: string, minimum: string) => {
  const actual = versionParts(version)
  const required = versionParts(minimum)
  for (let index = 0; index < required.length; index += 1) {
    if (actual[index] !== required[index]) {
      return actual[index] > required[index]
    }
  }
  return true
}

assert.equal(
  isAtLeast(electronBuilderVersion, '26.16.1'),
  true,
  `electron-builder ${electronBuilderVersion} still contains the macOS keychain password bug`
)
assert.equal(
  isAtLeast(appBuilderLibVersion, '26.16.1'),
  true,
  `app-builder-lib ${appBuilderLibVersion} still contains the macOS keychain password bug`
)
assert.doesNotMatch(
  workflow,
  /security (?:create-keychain|import|set-key-partition-list)/,
  'the workflow must not create a second signing keychain when CSC_LINK is used'
)
assert.match(workflow, /CSC_LINK:\s*\$\{\{ secrets\.MACOS_CERTIFICATE \}\}/)
assert.match(workflow, /CSC_KEY_PASSWORD:\s*\$\{\{ secrets\.MACOS_CERTIFICATE_PWD \}\}/)

console.log('macOS signing workflow checks passed')
