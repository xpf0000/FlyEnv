import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { createConnection } from 'node:net'
import { createAppHelperChecker, HelperVersion } from '../src/shared/AppHelperCheck'
import {
  readWindowsHelperTask,
  windowsHelperArguments,
  windowsHelperInstallationMatches,
  windowsHelperInstancePaths,
  type WindowsHelperIdentity,
  type WindowsHelperTask
} from '../src/shared/WindowsHelperIdentity'

const tempRoot = await fs.mkdtemp(path.join(tmpdir(), 'flyenv-helper-update-'))
const identity: WindowsHelperIdentity = {
  ...windowsHelperInstancePaths('S-1-5-21-100-200-300-1001'),
  account: 'test-user',
  sid: 'S-1-5-21-100-200-300-1001',
  localAppData: tempRoot,
  executable: path.join(tempRoot, 'flyenv-helper.exe'),
  instanceConfigPath: path.join(tempRoot, 'instance.json')
}
const installedBuild = Buffer.from('previous signed build of the same helper version')
const repackagedBuild = Buffer.from(
  'new build or Authenticode signature of the same helper version'
)
const installation = {
  schemaVersion: 1,
  instanceId: identity.instanceId,
  sid: identity.sid,
  helperProtocol: HelperVersion,
  helperSha256: crypto.createHash('sha256').update(installedBuild).digest('hex'),
  executable: identity.executable,
  keyPath: identity.keyPath,
  allowedRootsPath: identity.allowedRootsPath,
  pipeName: identity.pipeName
}
const saveInstallation = (config: unknown = installation, bom = false) =>
  fs.writeFile(identity.instanceConfigPath, `${bom ? '\uFEFF' : ''}${JSON.stringify(config)}`)
const task: WindowsHelperTask = {
  principal: 'S-1-5-18',
  logonType: 5,
  runLevel: 1,
  enabled: true,
  executable: identity.executable,
  arguments: windowsHelperArguments(identity),
  actionCount: 1,
  triggerSid: identity.sid,
  triggerCount: 1,
  binaryMatches: true,
  state: 4
}
let version = HelperVersion
let healthSid = identity.sid
let pipeAvailable = true
let responseCode = 0
let requests = 0
let taskOverride: Partial<WindowsHelperTask> = {}
const checker = createAppHelperChecker({
  isWindows: () => true,
  isLinux: () => false,
  helperBinaryExists: () => true,
  getWindowsIdentity: async () => identity,
  getHelperKey: async () => Buffer.alloc(32, 1),
  readWindowsTask: async (target, expectedVersion) => {
    assert.equal(target, identity)
    assert.equal(expectedVersion, HelperVersion)
    return {
      ...task,
      ...taskOverride,
      binaryMatches: await windowsHelperInstallationMatches(target, expectedVersion)
    }
  },
  createConnection: (() => {
    const client = new EventEmitter() as EventEmitter & {
      write: (value: string, callback: () => void) => void
      end: () => void
      destroy: () => void
    }
    client.write = (value, callback) => {
      requests++
      const request = JSON.parse(value)
      callback()
      queueMicrotask(() =>
        client.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              key: request.key,
              code: responseCode,
              msg: responseCode ? 'signature is invalid' : undefined,
              data:
                request.function === 'version'
                  ? version
                  : { version, pid: 123, sid: healthSid, instanceId: identity.instanceId }
            })
          )
        )
      )
    }
    client.end = () => queueMicrotask(() => client.emit('end'))
    client.destroy = () => {}
    queueMicrotask(() =>
      pipeAvailable ? client.emit('connect') : client.emit('error', new Error('pipe is stopped'))
    )
    return client
  }) as typeof createConnection
})

try {
  await fs.writeFile(identity.executable, installedBuild)
  await fs.writeFile(path.join(tempRoot, 'bundled-helper.exe'), repackagedBuild)
  assert.notEqual(
    installation.helperSha256,
    crypto.createHash('sha256').update(repackagedBuild).digest('hex')
  )
  await saveInstallation(installation, true)
  assert.equal(await windowsHelperInstallationMatches(identity, HelperVersion), true)
  assert.deepEqual(await checker(), {
    version: HelperVersion,
    pid: 123,
    sid: identity.sid,
    instanceId: identity.instanceId
  })
  assert.equal(requests, 2, 'same-version repackaging must pass version and health checks')

  // The bundled copy is not the installed integrity baseline and is never executed for version checks.
  await fs.rm(path.join(tempRoot, 'bundled-helper.exe'))
  assert.equal(await windowsHelperInstallationMatches(identity, HelperVersion), true)
  await checker()

  for (const patch of [
    { schemaVersion: 2 },
    { helperProtocol: HelperVersion - 1 },
    { helperProtocol: HelperVersion + 1 },
    { sid: 'S-1-5-18' },
    { instanceId: 'another-instance' },
    { pipeName: 'another-pipe' },
    { executable: 'C:\\other\\helper.exe' },
    { keyPath: 'C:\\other\\helper.key' },
    { allowedRootsPath: 'C:\\other\\roots' },
    { helperSha256: 'not-a-hash' },
    { helperSha256: '0'.repeat(64) }
  ]) {
    await saveInstallation({ ...installation, ...patch })
    const before = requests
    await assert.rejects(checker, { code: 'helper_task_invalid' })
    assert.equal(requests, before, 'invalid installations must fail before RPC')
    await assert.rejects(readWindowsHelperTask(identity, HelperVersion, true), /Refusing to start/)
  }
  for (const invalid of ['null', '{broken-json', '[]']) {
    await fs.writeFile(identity.instanceConfigPath, invalid)
    assert.equal(await windowsHelperInstallationMatches(identity, HelperVersion), false)
  }
  await fs.rm(identity.instanceConfigPath)
  assert.equal(await windowsHelperInstallationMatches(identity, HelperVersion), false)
  await saveInstallation()
  await fs.writeFile(identity.executable, 'changed after installation')
  await assert.rejects(checker, { code: 'helper_task_invalid' })
  await assert.rejects(readWindowsHelperTask(identity, HelperVersion, true), /Refusing to start/)
  await fs.rm(identity.executable)
  assert.equal(await windowsHelperInstallationMatches(identity, HelperVersion), false)
  await fs.writeFile(identity.executable, installedBuild)

  version = HelperVersion - 1
  await assert.rejects(checker, { code: 'helper_version_mismatch' })
  version = HelperVersion
  healthSid = 'S-1-5-18'
  await assert.rejects(checker, { code: 'helper_health_invalid' })
  healthSid = identity.sid
  responseCode = 1
  await assert.rejects(checker, { code: 'helper_signature_invalid' })
  responseCode = 0
  pipeAvailable = false
  await assert.rejects(checker, { code: 'helper_pipe_unreachable' })
  pipeAvailable = true
  for (const override of [
    { principal: identity.sid },
    { enabled: false },
    { arguments: '--instance-id another-user' },
    { triggerSid: 'S-1-5-18' }
  ]) {
    taskOverride = override
    await assert.rejects(checker, { code: 'helper_task_invalid' })
  }
  taskOverride = {}
  await checker()
  console.log('Windows helper same-version update and validation regression tests passed')
} finally {
  // Only remove the exact temporary directory created by this test.
  await fs.rm(tempRoot, { recursive: true, force: true })
}
