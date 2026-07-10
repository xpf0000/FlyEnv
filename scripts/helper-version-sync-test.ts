import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const expectedVersion = 16

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

function extractVersion(source: string, pattern: RegExp, label: string): number {
  const match = source.match(pattern)
  assert.ok(match, `${label} version declaration not found`)
  return Number(match[1])
}

const tsSource = readFile('src/shared/AppHelperCheck.ts')
const goSource = readFile('src/helper-go/main.go')

const sharedVersion = extractVersion(
  tsSource,
  /export const HelperVersion = (\d+)/,
  'shared helper check'
)
const helperVersion = extractVersion(goSource, /Helper_Version\s*=\s*(\d+)/, 'helper go')

assert.equal(sharedVersion, expectedVersion, 'shared helper check version should be bumped')
assert.equal(helperVersion, expectedVersion, 'helper go version should be bumped')
assert.equal(sharedVersion, helperVersion, 'shared helper check and helper go versions must match')

console.log('helper version sync test passed')
