import assert from 'node:assert/strict'
import { createFetchRawPATH, createReadSystemPathDirect } from '../src/fork/util/PATH.win'

async function main() {
  assert.equal(typeof createFetchRawPATH, 'function')
  assert.equal(typeof createReadSystemPathDirect, 'function')

  let spawnedCommands: string[] = []
  let powerShellArgs: string[] | undefined
  const directRead = createReadSystemPathDirect({
    syncEnv: async () =>
      ({
        SystemRoot: 'C:\\Windows'
      }) as any,
    getPowerShellPath: () => 'powershell.exe',
    getRegistryToolPath: () => 'reg.exe',
    readWithSpawn: async (command: string, args?: string[]) => {
      spawnedCommands.push(command)
      if (command === 'powershell.exe') {
        powerShellArgs = args
        throw new Error('powershell unavailable')
      }
      return {
        stdout:
          '\r\nHKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment\r\n    Path    REG_EXPAND_SZ    D:\\Env\\bin;%SystemRoot%\\System32;\r\n',
        stderr: ''
      }
    }
  } as any)

  const directReadValue = await directRead()
  assert.equal(directReadValue, 'D:\\Env\\bin;%SystemRoot%\\System32;')
  assert.deepEqual(spawnedCommands, ['powershell.exe', 'reg.exe'])
  const encodedCommand = powerShellArgs?.[5]
  assert.equal(typeof encodedCommand, 'string')
  const powerShellScript = Buffer.from(encodedCommand!, 'base64').toString('utf16le')
  assert.match(powerShellScript, /OpenSubKey/)
  assert.match(powerShellScript, /DoNotExpandEnvironmentNames/)

  let directReadCalls = 0
  const directFirstFetch = createFetchRawPATH({
    readSystemPathDirect: async () => {
      directReadCalls += 1
      return 'C:\\FlyEnv\\bin;%SystemRoot%\\System32;'
    }
  })

  const directFirst = await directFirstFetch()
  assert.deepEqual(directFirst, ['C:\\FlyEnv\\bin', '%SystemRoot%\\System32'])
  assert.equal(directReadCalls, 1)

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
