import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  parseWindowsWhoAmIUserCsv,
  windowsHelperKeyPath
} from '../src/shared/WindowsHelperIdentity'

const source = fs.readFileSync(path.resolve(process.cwd(), 'src/main/core/AppHelper.ts'), 'utf8')

assert.deepEqual(
  parseWindowsWhoAmIUserCsv('"CONTOSO\\flyenv","S-1-5-21-100-200-300-400"\r\n'),
  { account: 'CONTOSO\\flyenv', sid: 'S-1-5-21-100-200-300-400' }
)
assert.throws(() => parseWindowsWhoAmIUserCsv('not a whoami csv record'), /Could not parse/)
assert.equal(
  windowsHelperKeyPath('C:\\Users\\flyenv\\AppData\\Local'),
  'C:\\Users\\flyenv\\AppData\\Local\\FlyEnv\\flyenv-helper.key'
)

assert.match(source, /getWindowsHelperIdentity\(\)/)
assert.match(source, /\.replace\('#APPUSERNAME#', windowsIdentity\.account\)/)
assert.match(source, /\.replace\('#APPUSERSID#', windowsIdentity\.sid\)/)
assert.match(source, /\.replace\('#KEYPATH#', windowsIdentity\.keyPath\)/)

console.log('windows-helper-identity-test: ok')
