import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { clickHouseVersionPidFile } from '../src/fork/module/ClickHouse/lifecycle'
import type { PItem } from '../src/shared/Process'
import { ProcessOwnedPidsByPidOrDescendant } from '../src/shared/Process'

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
assert.match(
  directStopSource,
  /ProcessOwnedPidsByPidOrDescendant\(\s*pid,\s*plist,\s*\[version\.bin\],\s*\['clickhouse-watchdog'\]\s*\)/,
  'direct ClickHouse stop must validate a watchdog through its exact version-binary descendant'
)
assert.match(
  directStopSource,
  /'APP-Service-Stale-Bins': staleBins/,
  'untrusted saved PIDs must request bin-specific deregistration instead of PID deregistration'
)
assert.match(
  source,
  /const managedPid = await this\.managedClickHousePid\(spawnedPid, version\)/,
  'the PID handed to main must be the validated stable ClickHouse root'
)
assert.match(source, /await writeFile\(this\.versionPidFile\(version\), managedPid\)/)
assert.doesNotMatch(
  directStopSource,
  /ProcessOwnedPidsByPid\(pid, plist, \[version\.bin\]\)/,
  'the old root-command-only check cannot validate a watchdog'
)
assert.doesNotMatch(
  directStopSource,
  /super\._stopServer/,
  "stopping one version must not use Base's module-wide process search"
)

const bin = '/tmp/flyenv/app/clickhouse-26.7/clickhouse'
const processList: PItem[] = [
  { PID: '100', PPID: '1', USER: 'x', COMMAND: 'clickhouse-watchdog' },
  { PID: '101', PPID: '100', USER: 'x', COMMAND: `${bin} server` },
  { PID: '200', PPID: '1', USER: 'x', COMMAND: 'clickhouse-watchdog' },
  { PID: '201', PPID: '200', USER: 'x', COMMAND: '/tmp/other/clickhouse server' },
  {
    PID: '300',
    PPID: '1',
    USER: 'x',
    COMMAND: '/Applications/FlyEnv.app/Contents/MacOS/FlyEnv --type=renderer'
  },
  { PID: '301', PPID: '300', USER: 'x', COMMAND: `${bin} server` }
]

assert.deepEqual(
  ProcessOwnedPidsByPidOrDescendant('100', processList, [bin], ['clickhouse-watchdog']),
  ['100', '101'],
  'a ClickHouse watchdog is owned only when its descendant runs the exact requested binary'
)
assert.deepEqual(
  ProcessOwnedPidsByPidOrDescendant('200', processList, [bin], ['clickhouse-watchdog']),
  [],
  'a watchdog for another ClickHouse binary must not be signalled'
)
assert.deepEqual(
  ProcessOwnedPidsByPidOrDescendant('300', processList, [bin], ['clickhouse-watchdog']),
  [],
  'a reused Electron renderer PID must never become owned through its descendants'
)

const ipcHandlerSource = readFileSync(
  new URL('../src/main/core/IPCHandler.ts', import.meta.url),
  'utf8'
)
const staleBinCleanup = ipcHandlerSource.indexOf('APP-Service-Stale-Bins')
const startPidRegistration = ipcHandlerSource.indexOf('ServiceProcessManager.addPid')
assert.ok(staleBinCleanup >= 0, 'IPC must recognise ClickHouse stale-bin cleanup')
assert.ok(
  ipcHandlerSource.indexOf('ServiceProcessManager.delByBin', staleBinCleanup) > staleBinCleanup,
  'stale cleanup must delete by exact bin'
)
assert.ok(
  staleBinCleanup < startPidRegistration,
  'stale registration must be deleted before a replacement PID is added'
)

const mcpToolsSource = readFileSync(new URL('../src/main/core/MCPTools.ts', import.meta.url), 'utf8')
const mcpStart = mcpToolsSource.indexOf('async startService(flag: string, version?: string)')
const mcpStartEnd = mcpToolsSource.indexOf('async stopService(flag: string, version?: string)')
const mcpStartSource = mcpToolsSource.slice(mcpStart, mcpStartEnd)
assert.match(mcpStartSource, /APP-Service-Stale-Bins/)
assert.ok(
  mcpStartSource.indexOf('ServiceProcessManager.delByBin') <
    mcpStartSource.indexOf('ServiceProcessManager.addPid'),
  'MCP replacement must also remove stale registrations before adding a PID'
)

console.log('clickhouse service lifecycle tests passed')
