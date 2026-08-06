import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  filterJavaCandidates,
  isNeo4jSupportedVersion,
  resolveNeo4jJavaPolicy
} from '../src/shared/neo4j-policy'
import { compareVersions } from '../src/shared/compare-versions'

const policySource = readFileSync(
  join(import.meta.dirname, '../src/shared/neo4j-policy.ts'),
  'utf8'
)
assert.match(policySource, /import \{ compareVersions \} from ['"]\.\/compare-versions['"]$/m)
assert.doesNotMatch(policySource, /function compareVersions\(/)

assert.equal(compareVersions('v5.23.0', '5.23.0'), 0)
assert.equal(compareVersions('5.23.0-alpha', '5.23.0'), -1)
assert.equal(compareVersions('5.10.0', '5.9.0'), 1)

assert.deepEqual(resolveNeo4jJavaPolicy('5.23.0'), {
  supportedMajor: [17, 21],
  recommendedMajor: 21
})
assert.deepEqual(resolveNeo4jJavaPolicy('5.26.29'), {
  supportedMajor: [17, 21],
  recommendedMajor: 21
})
assert.deepEqual(resolveNeo4jJavaPolicy('2025.09.0'), {
  supportedMajor: [21],
  recommendedMajor: 21
})
assert.deepEqual(resolveNeo4jJavaPolicy('2025.10.0'), {
  supportedMajor: [21, 25],
  recommendedMajor: 21
})
assert.deepEqual(resolveNeo4jJavaPolicy('2026.07.0'), {
  supportedMajor: [21, 25],
  recommendedMajor: 21
})
assert.deepEqual(resolveNeo4jJavaPolicy('2027.01.0'), {
  supportedMajor: [21, 25],
  recommendedMajor: 21
})
assert.equal(isNeo4jSupportedVersion('5.22.0'), false)
assert.equal(
  filterJavaCandidates('2025.09.0', [
    { bin: '/jdk17/bin/java', path: '/jdk17', version: '17.0.12' },
    { bin: '/jdk21/bin/java', path: '/jdk21', version: '21.0.6' }
  ])[0].version,
  '21.0.6'
)

console.log('Neo4j policy tests passed')
