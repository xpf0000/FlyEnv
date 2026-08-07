import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const readSource = (path: string) => readFileSync(path, 'utf8')

const rabbitSource = readSource('src/fork/module/RabbitMQ/index.ts')
const versionSource = readSource('src/fork/util/Version.ts')
const processSource = readSource('src/shared/Process.win.ts')
const envSyncSource = readSource('src/shared/EnvSyncLocal.ts')
const moduleSource = readSource('src/render/core/Module/Module.ts')

assert.match(rabbitSource, /const RABBITMQ_EPMD_START_TIMEOUT_MS = 60_000/)
assert.match(rabbitSource, /const RABBITMQ_VERSION_COMMAND_TIMEOUT_MS = 60_000/)
assert.ok(
  rabbitSource.includes("replace(/^['\"]|['\"]$/g, '')"),
  'Erlang environment paths must tolerate outer quotes'
)
assert.match(rabbitSource, /env\?\.PATH \?\? env\?\.Path/)
assert.match(
  rabbitSource,
  /const epmdCandidates = \[join\(str, 'bin', 'epmd\.exe'\)\]/,
  'ERLANG_HOME must resolve epmd.exe directly from its standard bin directory'
)
assert.match(rabbitSource, /timeout: RABBITMQ_EPMD_START_TIMEOUT_MS/)
assert.match(
  rabbitSource,
  /TaskQueue\.run\(\s*versionBinVersion,\s*bin,\s*command,\s*reg,\s*false,\s*RABBITMQ_VERSION_COMMAND_TIMEOUT_MS\s*\)/m
)

assert.match(
  versionSource,
  /findInError\?: boolean,\s*timeoutMs\?: number/m,
  'version probes must accept a caller-specific deadline'
)
assert.match(
  versionSource,
  /timeout: timeoutMs/,
  'version probes must pass the deadline to child_process.exec'
)
assert.match(versionSource, /const COMMAND_LOOKUP_TIMEOUT_MS = 60_000/)
assert.match(
  versionSource,
  /where\.exe \$\{binName\}[\s\S]{0,120}timeout: COMMAND_LOOKUP_TIMEOUT_MS/
)

assert.match(processSource, /const PROCESS_LIST_TIMEOUT_MS = 60_000/)
assert.match(
  processSource,
  /timeout: PROCESS_LIST_TIMEOUT_MS/,
  'the Win32_Process query must not block RabbitMQ enumeration indefinitely'
)

assert.match(envSyncSource, /const WINDOWS_ENV_FETCH_TIMEOUT_MS = 60_000/)
assert.match(
  envSyncSource,
  /execFilePromise\([\s\S]{0,1000}timeout: WINDOWS_ENV_FETCH_TIMEOUT_MS/,
  'Windows environment synchronization must not block service enumeration indefinitely'
)

assert.match(moduleSource, /const FETCH_INSTALLED_TIMEOUT_MS = 60_000/)
assert.match(moduleSource, /private _fetchInstalledTimer\?: ReturnType<typeof setTimeout>/)
assert.match(moduleSource, /private _settleFetchInstalled\(/)
assert.match(moduleSource, /this\._fetchInstalledTimer = setTimeout\(/)
assert.match(moduleSource, /IPC\.off\(key\)/)
assert.match(
  moduleSource,
  /finally \{\s*if \(!settled\) \{\s*settled = true\s*this\._settleFetchInstalled\(resolve, fetched\)/m,
  'response processing must remain covered by the renderer deadline'
)

console.log('rabbitmq enumeration timeout tests passed')
