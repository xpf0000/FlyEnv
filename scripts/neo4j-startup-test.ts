import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  neo4jProcessCommandMatchesInstance,
  neo4jStopProcessPids,
  neo4jStartupProcessState,
  waitForNeo4jStartupProcess
} from '../src/fork/module/Neo4j/startup'

const root = join(import.meta.dirname, '..')
const neo4jFork = readFileSync(join(root, 'src/fork/module/Neo4j/index.ts'), 'utf-8')
const neo4jStartup = readFileSync(join(root, 'src/fork/module/Neo4j/startup.ts'), 'utf-8')

assert.doesNotMatch(neo4jFork, /import axios from 'axios'/)
assert.doesNotMatch(neo4jFork, /waitForHttp\(/)
assert.doesNotMatch(neo4jFork, /checkNeo4jHealth\(/)
assert.doesNotMatch(neo4jFork, /logOffset\(|startupLogOffset|readLog:/)
assert.doesNotMatch(neo4jFork, /readFile\(paths\.(?:startOut|startError)/)
assert.doesNotMatch(neo4jFork, /const config = await readFile\(paths\.configFile, 'utf-8'\)/)
assert.doesNotMatch(neo4jFork, /is ready on HTTP/)
assert.match(neo4jFork, /waitForNeo4jStartupProcess\(/)
assert.match(neo4jFork, /\{ isMacOS, isWindows, waitTime \} from '@shared\/utils'/)
assert.match(
  neo4jStartup,
  /import \{ ProcessListByExactPid, ProcessPidsByPid, type PItem \} from '@shared\/Process'/
)
assert.doesNotMatch(neo4jStartup, /function processTreePids\(/)
assert.match(
  neo4jFork,
  /const startupPid = res\['APP-Service-Start-PID'\][\s\S]{0,300}const startupCommand/
)

const installationPath = 'E:\\FlyEnv Data\\neo4j\\2026.07.0'
const configDir = 'E:\\FlyEnv Data\\server\\neo4j\\instances\\test\\conf'
const startupCommand = `powershell.exe -File ${installationPath}\\bin\\neo4j.ps1 console`
const processes = [
  { PID: '100', PPID: '1', COMMAND: startupCommand },
  {
    PID: '101',
    PPID: '100',
    COMMAND: `java.exe --home-dir="${installationPath}" --config-dir="${configDir}" --console-mode`
  }
]

assert.equal(
  neo4jProcessCommandMatchesInstance(processes[1].COMMAND, installationPath, configDir),
  true
)

const orphanedNeo4jProcesses = [
  {
    PID: '200',
    PPID: '999',
    COMMAND: `java.exe -cp ${installationPath}\\lib\\* org.neo4j.server.startup.Neo4jCommand console`
  },
  {
    PID: '201',
    PPID: '200',
    COMMAND: `java.exe --home-dir=${installationPath} --config-dir=${configDir} --console-mode`
  },
  { PID: '202', PPID: '201', COMMAND: 'java.exe org.neo4j.worker' },
  { PID: '203', PPID: '1', COMMAND: 'java.exe --home-dir=E:\\other --config-dir=E:\\other\\conf' }
]

assert.deepEqual(
  neo4jStopProcessPids(orphanedNeo4jProcesses, '100', installationPath, configDir),
  ['200', '201', '202'],
  'stop must recover the matching Java process and its wrapper/children when the startup PID is gone'
)
assert.deepEqual(
  neo4jStopProcessPids(
    [processes[0], ...orphanedNeo4jProcesses.slice(0, 3)],
    '100',
    installationPath,
    configDir
  ),
  ['100', '200', '201', '202'],
  'stop must include the startup PID tree as well as an already reparented matching Java tree'
)

const orphanedStartupTree = [
  { PID: '14956', PPID: '24692', COMMAND: '\\??\\C:\\WINDOWS\\system32\\conhost.exe 0x4' },
  {
    PID: '26516',
    PPID: '24692',
    COMMAND: `java.exe -cp ${installationPath}\\lib\\* org.neo4j.server.startup.Neo4jCommand console`
  },
  {
    PID: '19692',
    PPID: '26516',
    COMMAND: `java.exe --home-dir=${installationPath} --config-dir=${configDir} --console-mode`
  }
]
assert.deepEqual(
  neo4jStopProcessPids(orphanedStartupTree, '24692', installationPath, configDir),
  ['26516', '19692', '14956'],
  'stop must include all surviving descendants when the recorded Windows launcher PID already exited'
)

const liveStartupTree = [
  { PID: '24692', PPID: '1', COMMAND: 'powershell.exe -NoProfile -Command neo4j console' },
  ...orphanedStartupTree
]
assert.deepEqual(
  neo4jStopProcessPids(liveStartupTree, '24692', installationPath, configDir),
  ['26516', '24692', '14956', '19692'],
  'the exact Neo4j JVM must verify the recorded launcher tree even when the launcher command omits its path'
)

assert.equal(
  neo4jProcessCommandMatchesInstance(
    processes[1].COMMAND,
    'E:\\FlyEnv Data\\neo4j\\other-copy\\2026.07.0',
    configDir
  ),
  false,
  'same product version in another installation path must not match'
)
assert.deepEqual(
  neo4jStartupProcessState(processes, '100', startupCommand, installationPath, configDir),
  { status: 'ready' }
)
assert.equal(
  neo4jStartupProcessState([], '100', startupCommand, installationPath, configDir).status,
  'exited'
)
assert.equal(
  neo4jStartupProcessState(
    [{ ...processes[0], COMMAND: 'powershell.exe other.ps1 console' }, processes[1]],
    '100',
    startupCommand,
    installationPath,
    configDir
  ).status,
  'command-changed'
)
assert.equal(
  neo4jStartupProcessState(
    [processes[0], { ...processes[1], COMMAND: 'java.exe --home-dir=C:\\other' }],
    '100',
    startupCommand,
    installationPath,
    configDir
  ).status,
  'server-command-missing'
)

await assert.doesNotReject(() =>
  waitForNeo4jStartupProcess({
    startupPid: '100',
    startupCommand,
    installationPath,
    configDir,
    listProcesses: async () => processes,
    wait: async () => undefined,
    attempts: 2
  })
)

let readyThenExitedCalls = 0
await assert.doesNotReject(() =>
  waitForNeo4jStartupProcess({
    startupPid: '100',
    startupCommand,
    installationPath,
    configDir,
    listProcesses: async () => (readyThenExitedCalls++ === 0 ? processes : []),
    wait: async () => undefined,
    attempts: 2
  })
)

let pendingThenReadyCalls = 0
await assert.doesNotReject(() =>
  waitForNeo4jStartupProcess({
    startupPid: '100',
    startupCommand,
    installationPath,
    configDir,
    listProcesses: async () => (pendingThenReadyCalls++ === 0 ? [processes[0]] : processes),
    wait: async () => undefined,
    attempts: 2
  })
)

console.log('Neo4j startup tests passed')
