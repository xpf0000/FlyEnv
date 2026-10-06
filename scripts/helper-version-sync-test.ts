import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
// Go 源码变更的发布版本必须与 Go、应用端同时递增；检查双方一致仍不足以
// 防止两边一起漏升版本，因此保留独立的本次发布版本断言。
const expectedVersion = 42

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
const macBuildSource = readFile('configs/electron-builder.ts')

const sharedVersion = extractVersion(
  tsSource,
  /export const HelperVersion = (\d+)/,
  'shared helper check'
)
const helperVersion = extractVersion(goSource, /Helper_Version\s*=\s*(\d+)/, 'helper go')
const macInstallProtocol = extractVersion(
  macBuildSource,
  /FlyEnvHelperProtocolVersion:\s*(\d+)/,
  'signed macOS install protocol'
)

assert.equal(sharedVersion, expectedVersion, 'shared helper check version should be bumped')
assert.equal(helperVersion, expectedVersion, 'helper go version should be bumped')
assert.equal(sharedVersion, helperVersion, 'shared helper check and helper go versions must match')
assert.equal(
  macInstallProtocol,
  helperVersion,
  'signed macOS snapshot must require the current helper protocol'
)

console.log('helper version sync test passed')
