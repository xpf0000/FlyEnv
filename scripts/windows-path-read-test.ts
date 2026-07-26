import assert from 'node:assert/strict'
import {
  createFetchRawPATH,
  createFetchRawPATHSnapshot,
  createReadSystemPathDirect
} from '../src/fork/util/PATH.win'
import { spawnPromiseWithEnv } from '../src/shared/child-process'

async function main() {
  assert.equal(typeof createFetchRawPATH, 'function')
  assert.equal(typeof createReadSystemPathDirect, 'function')

  const rawOutput = '  C:\\FlyEnv\\bin;  \n'
  const rawSpawnArgs = ['-e', `process.stdout.write(${JSON.stringify(rawOutput)})`]
  const rawSpawnResult = await spawnPromiseWithEnv(process.execPath, rawSpawnArgs, {
    shell: false,
    trimOutput: false
  })
  assert.equal(rawSpawnResult.stdout, rawOutput)
  const defaultSpawnResult = await spawnPromiseWithEnv(process.execPath, rawSpawnArgs, {
    shell: false
  })
  assert.equal(defaultSpawnResult.stdout, rawOutput.trim())

  const spawnedCommands: string[] = []
  let powerShellArgs: string[] | undefined
  const directRead = createReadSystemPathDirect({
    syncEnv: async () =>
      ({
        SystemRoot: 'C:\\Windows'
      }) as any,
    getPowerShellPath: () => 'powershell.exe',
    getRegistryToolPath: () => 'reg.exe',
    readWithSpawn: async (command: string, args?: string[], options?: { trimOutput?: boolean }) => {
      spawnedCommands.push(command)
      assert.equal(options?.trimOutput, false)
      if (command === 'powershell.exe') {
        powerShellArgs = args
        throw new Error('powershell unavailable')
      }
      return {
        stdout:
          '\r\nHKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment\r\n    Path    REG_EXPAND_SZ     D:\\Env\\bin;%SystemRoot%\\System32;\r\n',
        stderr: ''
      }
    }
  } as any)

  const directReadValue = await directRead()
  assert.equal(directReadValue, ' D:\\Env\\bin;%SystemRoot%\\System32;')
  assert.deepEqual(spawnedCommands, ['powershell.exe', 'reg.exe'])
  const encodedCommand = powerShellArgs?.[5]
  assert.equal(typeof encodedCommand, 'string')
  const powerShellScript = Buffer.from(encodedCommand!, 'base64').toString('utf16le')
  assert.match(powerShellScript, /OpenSubKey/)
  assert.match(powerShellScript, /DoNotExpandEnvironmentNames/)

  const powerShellRead = createReadSystemPathDirect({
    syncEnv: async () => ({}) as any,
    getPowerShellPath: () => 'powershell.exe',
    readWithSpawn: async () => ({
      stdout: ' C:\\SDK\\bin;;relative\\tool;\r\n',
      stderr: ''
    })
  } as any)
  assert.equal(await powerShellRead(), ' C:\\SDK\\bin;;relative\\tool;')

  let directReadCalls = 0
  const directFirstFetch = createFetchRawPATH({
    readSystemPathDirect: async () => {
      directReadCalls += 1
      return 'C:\\FlyEnv\\bin;%SystemRoot%\\System32;'
    }
  })

  const directFirst = await directFirstFetch()
  assert.deepEqual(directFirst, ['C:\\FlyEnv\\bin', '%SystemRoot%\\System32', ''])
  assert.equal(directReadCalls, 1)

  const directSnapshotFetch = createFetchRawPATHSnapshot({
    readSystemPathDirect: async () => 'C:\\FlyEnv\\bin;%SystemRoot%\\System32;'
  })
  assert.deepEqual(await directSnapshotFetch(), {
    rawPath: 'C:\\FlyEnv\\bin;%SystemRoot%\\System32;',
    entries: ['C:\\FlyEnv\\bin', '%SystemRoot%\\System32', '']
  })

  let readFailures = 0
  const directFailureFetch = createFetchRawPATH({
    readSystemPathDirect: async () => {
      readFailures += 1
      throw new Error('direct read failed')
    }
  })
  await assert.rejects(() => Promise.resolve(directFailureFetch(true)), /direct read failed/)
  assert.equal(readFailures, 1)

  console.log('windows path read test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
