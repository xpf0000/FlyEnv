import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

const source = readFileSync(
  new URL('../src/fork/module/ClickHouse/index.ts', import.meta.url),
  'utf8'
)
const directStopSource = source.slice(
  source.indexOf('_stopServer(version: SoftInstalled'),
  source.indexOf('private async _stopCHUI')
)

assert.match(source, /startService\(version: SoftInstalled, \.\.\.args: any\)/)
assert.match(source, /private _stopAllServers\(version: SoftInstalled, \.\.\.args: any\)/)
assert.match(source, /pidPath: this\.versionPidFile\(version\)/)
assert.match(directStopSource, /const plist = await ProcessListFetch\(\)/)
assert.match(directStopSource, /ProcessOwnedPidsByPid\(pid, plist, \[version\.bin\]\)/)
assert.doesNotMatch(
  directStopSource,
  /super\._stopServer/,
  "stopping one version must not use Base's module-wide process search"
)

console.log('clickhouse service lifecycle tests passed')
