import assert from 'node:assert/strict'
import { clickHouseVersionPidFile } from '../src/fork/module/ClickHouse/lifecycle'

const baseDir = '/tmp/flyenv'
const versionA = '/tmp/flyenv/app/clickhouse-25.8/clickhouse'
const versionB = '/tmp/flyenv/app/clickhouse-26.1/clickhouse'

const pidA = clickHouseVersionPidFile(baseDir, versionA)
const pidB = clickHouseVersionPidFile(baseDir, versionB)

assert.match(pidA, /^\/tmp\/flyenv\/pid\/clickhouse-[a-f0-9]{32}\.pid$/)
assert.notEqual(pidA, pidB, 'different ClickHouse binaries must never share a PID file')
assert.equal(
  clickHouseVersionPidFile(baseDir, versionA),
  pidA,
  'the same ClickHouse binary must always map to the same PID file'
)

console.log('clickhouse service lifecycle tests passed')
