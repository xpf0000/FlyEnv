import assert from 'node:assert/strict'
import {
  neo4jProcessCommandMatchesInstance,
  neo4jStartupProcessState,
  neo4jStopProcessPids,
  waitForNeo4jStartupProcess,
  type Neo4jStartupProcess
} from '../src/fork/module/Neo4j/startup'

const home = 'D:/Program Files/Neo4j/2026.07.0'
const config = "D:/Program Files/FlyEnv/user's instance/conf"
const rootCommand = `powershell.exe -File "${home}/bin/neo4j.ps1" console`
const row = (
  PID: string,
  PPID: string,
  COMMAND: string,
  extra: Partial<Neo4jStartupProcess> = {}
): Neo4jStartupProcess => ({
  PID,
  PPID,
  COMMAND,
  CREATED: '2026-10-25T00:00:00.000000Z',
  EXECUTABLE: 'C:/Java/bin/java.exe',
  ...extra
})
const root = row('24752', '1', rootCommand, { EXECUTABLE: 'C:/Windows/powershell.exe' })
const launcher = row(
  '25920',
  root.PID,
  `java -Dbasedir="${home}" org.neo4j.server.startup.Neo4jCommand console`
)
let count = 0
for (const args of [
  `"--home-dir=${home}" "--config-dir=${config}"`,
  `--home-dir="${home}" --config-dir="${config}"`,
  `--home-dir "${home}" --config-dir "${config}"`,
  `"--home-dir" "${home}" "--config-dir" "${config}"`,
  `"--home-dir=${home.replaceAll('/', '\\')}" "--config-dir=${config.replaceAll('/', '\\')}"`
]) {
  const server = row(
    '14988',
    launcher.PID,
    `java org.neo4j.server.Neo4jCommunity ${args} --console-mode`
  )
  assert.equal(neo4jProcessCommandMatchesInstance(server.COMMAND, home, config), true)
  const list = [root, launcher, server, row('999', server.PID, 'worker')]
  assert.deepEqual(neo4jStartupProcessState(list, root.PID, rootCommand, home, config), {
    status: 'ready'
  })
  assert.deepEqual(neo4jStopProcessPids(list, root.PID, home, config), [
    root.PID,
    launcher.PID,
    server.PID,
    '999'
  ])
  assert.deepEqual(
    neo4jStopProcessPids(list.slice(1), root.PID, home, config),
    [launcher.PID, server.PID, '999'],
    'exact home/config recovers the server tree after the PowerShell launcher exits'
  )
  count += 1
}
for (const args of [
  `"--home-dir=${home}.other" "--config-dir=${config}"`,
  `"--home-dir=${home}" "--config-dir=${config}.other"`,
  `"--home-dir=${home}" "--config-dir=${config.replace("user's", 'users')}"`,
  `"--description=prefix --home-dir=${home} --config-dir=${config}"`,
  `"--home-dir=${home}"suffix "--config-dir=${config}"`,
  `"--home-dir=${home}" --config-directory="${config}"`
]) {
  assert.equal(neo4jProcessCommandMatchesInstance(`java ${args}`, home, config), false, args)
  count += 1
}
const server = row(
  '14988',
  launcher.PID,
  `java org.neo4j.server.Neo4jCommunity "--home-dir=${home}" "--config-dir=${config}"`
)
const external = { ...server, PID: '777', PPID: '1' }
assert.equal(
  neo4jStartupProcessState([root, external], root.PID, rootCommand, home, config).status,
  'server-command-missing',
  'the same instance command outside the startup tree is not proof of this startup'
)
assert.equal(neo4jStartupProcessState([], root.PID, rootCommand, home, config).status, 'exited')
assert.equal(
  neo4jStartupProcessState([{ ...root, COMMAND: 'other' }], root.PID, rootCommand, home, config)
    .status,
  'command-changed'
)
const unreadable = { ...external, EXECUTABLE: '' }
assert.deepEqual(
  neo4jStopProcessPids([unreadable, launcher, server], root.PID, home, config),
  [launcher.PID, server.PID],
  'an unreadable candidate must not prevent discovery of the valid tree'
)
let calls = 0
let waits = 0
await waitForNeo4jStartupProcess({
  startupPid: root.PID,
  startupCommand: rootCommand,
  installationPath: home,
  configDir: config,
  attempts: 3,
  listProcesses: async () => [root, launcher, ...(calls++ === 2 ? [server] : [])],
  wait: async () => {
    waits += 1
  }
})
assert.equal(calls, 3)
assert.equal(waits, 2)
await assert.rejects(
  waitForNeo4jStartupProcess({
    startupPid: root.PID,
    startupCommand: rootCommand,
    installationPath: home,
    configDir: config,
    attempts: 2,
    listProcesses: async () => [root, launcher],
    wait: async () => {}
  }),
  /Neo4j server command was not found/
)
await assert.rejects(
  waitForNeo4jStartupProcess({
    startupPid: root.PID,
    startupCommand: rootCommand,
    installationPath: home,
    configDir: config,
    listProcesses: async () => {
      throw new Error('process list failed')
    },
    wait: async () => assert.fail('a failed query cannot be treated as an empty startup tree')
  }),
  /process list failed/
)
console.log(`Neo4j startup/stop regression: ${count + 7} cases passed`)
