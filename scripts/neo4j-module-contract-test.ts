import assert from 'node:assert/strict'
import {
  NEO4J_DEFAULT_HTTP_PORT,
  neo4jInstallPaths,
  neo4jInstanceKey,
  parseNeo4jBoltPort,
  parseNeo4jHttpPort,
  upsertNeo4jDirectorySettings
} from '../src/fork/module/Neo4j/contract'
import { isNeo4jSupportedVersion } from '../src/shared/neo4j-policy'

const unix = neo4jInstallPaths('/tmp/flyenv-app', '5.26.1', false)
const windows = neo4jInstallPaths('C:/FlyEnv/app', '5.26.1', true)
assert.equal(unix.bin, '/tmp/flyenv-app/neo4j/5.26.1/bin/neo4j')
assert.equal(windows.bin.replaceAll('\\', '/'), 'C:/FlyEnv/app/neo4j/5.26.1/bin/neo4j.bat')
assert.notEqual(neo4jInstanceKey('/tmp/neo4j/a'), neo4jInstanceKey('/tmp/neo4j/b'))
assert.equal(neo4jInstanceKey('/tmp/neo4j/a'), neo4jInstanceKey('/tmp/neo4j/a/'))

assert.equal(isNeo4jSupportedVersion('5.22.9'), false)
assert.equal(isNeo4jSupportedVersion('5.23.0'), true)
assert.equal(isNeo4jSupportedVersion('2026.07.0'), true)

const original = `#server.directories.data=ignored\nserver.http.listen_address=127.0.0.1:17474\nserver.bolt.listen_address=:17687\ncustom.key=keep\n`
const initialized = upsertNeo4jDirectorySettings(original, {
  'server.directories.data': '/tmp/flyenv/instances/a/data',
  'server.directories.logs': '/tmp/flyenv/instances/a/logs'
})
assert.match(initialized, /server\.directories\.data=\/tmp\/flyenv\/instances\/a\/data/)
assert.match(initialized, /server\.directories\.logs=\/tmp\/flyenv\/instances\/a\/logs/)
assert.match(initialized, /custom\.key=keep/)
assert.equal(parseNeo4jHttpPort(initialized), 17474)
assert.equal(parseNeo4jBoltPort(initialized), 17687)
assert.equal(parseNeo4jHttpPort('#server.http.listen_address=:9999\n'), NEO4J_DEFAULT_HTTP_PORT)

console.log('Neo4j module contract tests passed')
