import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  parseWindowsWhoAmIUserCsv,
  windowsHelperBinariesMatch,
  windowsHelperInstanceId,
  windowsHelperInstancePaths
} from '../src/shared/WindowsHelperIdentity'

const source = fs.readFileSync(path.resolve(process.cwd(), 'src/main/core/AppHelper.ts'), 'utf8')

assert.deepEqual(parseWindowsWhoAmIUserCsv('"CONTOSO\\flyenv","S-1-5-21-100-200-300-400"\r\n'), {
  account: 'CONTOSO\\flyenv',
  sid: 'S-1-5-21-100-200-300-400'
})
assert.throws(() => parseWindowsWhoAmIUserCsv('not a whoami csv record'), /Could not parse/)
const sid = 'S-1-5-21-100-200-300-400'
const instanceId = 'abf09273e32cc15f69da240b7f8f588f'
assert.equal(windowsHelperInstanceId(sid), instanceId)
assert.throws(() => windowsHelperInstanceId('not-a-sid'), /Windows SID/)
assert.deepEqual(windowsHelperInstancePaths(sid, 'C:\\ProgramData'), {
  instanceId,
  instanceRoot: `C:\\ProgramData\\FlyEnv\\Helper\\users\\${instanceId}`,
  executable: `C:\\ProgramData\\FlyEnv\\Helper\\users\\${instanceId}\\bin\\flyenv-helper.exe`,
  keyPath: `C:\\ProgramData\\FlyEnv\\Helper\\users\\${instanceId}\\helper.key`,
  allowedRootsPath: `C:\\ProgramData\\FlyEnv\\Helper\\users\\${instanceId}\\allowed-roots`,
  instanceConfigPath: `C:\\ProgramData\\FlyEnv\\Helper\\users\\${instanceId}\\instance.json`,
  taskFolder: '\\FlyEnv\\Helper',
  taskName: instanceId,
  taskPath: `\\FlyEnv\\Helper\\${instanceId}`,
  pipeName: `FlyEnv.Helper.${instanceId}`,
  pipePath: `\\\\.\\pipe\\FlyEnv.Helper.${instanceId}`
})

assert.match(source, /getWindowsHelperIdentity\(\)/)
assert.match(source, /buildWindowsHelperInstallScript\(tmpl, \{/)
assert.match(source, /identity: windowsIdentity/)

const testBinaryFingerprint = async (): Promise<void> => {
  const tempDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'flyenv-helper-identity-'))
  try {
    const installed = path.join(tempDirectory, 'installed.exe')
    const bundled = path.join(tempDirectory, 'bundled.exe')
    await fs.promises.writeFile(installed, 'same helper binary')
    await fs.promises.writeFile(bundled, 'same helper binary')
    assert.equal(await windowsHelperBinariesMatch(installed, bundled), true)
    await fs.promises.writeFile(bundled, 'different helper binary')
    assert.equal(await windowsHelperBinariesMatch(installed, bundled), false)
    assert.equal(
      await windowsHelperBinariesMatch(installed, path.join(tempDirectory, 'missing.exe')),
      false
    )
  } finally {
    await fs.promises.rm(tempDirectory, { recursive: true, force: true })
  }
}

testBinaryFingerprint()
  .then(() => console.log('windows-helper-identity-test: ok'))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
