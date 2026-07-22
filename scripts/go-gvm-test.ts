import assert from 'node:assert/strict'
import {
  isGvmVersionIdentifier,
  mergeGvmVersionData,
  parseGvmAvailableVersions,
  parseGvmInstalledVersions,
  quotePosixShell
} from '../src/shared/Gvm'

const availableOutput = `
gvm gos (available)

   go1.24.4
   go1.24.5
   release.r60.3
   weekly.2012-03-13
   go1.24.5;touch /tmp/not-allowed
`

assert.deepEqual(parseGvmAvailableVersions(availableOutput), [
  'go1.24.4',
  'go1.24.5',
  'release.r60.3',
  'weekly.2012-03-13'
])

const installedOutput = `
gvm gos (installed)

   go1.23.9
=> go1.24.5
`

assert.deepEqual(parseGvmInstalledVersions(installedOutput), [
  { name: 'go1.23.9', isDefault: false },
  { name: 'go1.24.5', isDefault: true }
])

assert.deepEqual(mergeGvmVersionData(availableOutput, installedOutput), [
  { name: 'go1.24.4', version: '1.24.4', installed: false, isDefault: false },
  { name: 'go1.24.5', version: '1.24.5', installed: true, isDefault: true },
  {
    name: 'release.r60.3',
    version: 'release.r60.3',
    installed: false,
    isDefault: false
  },
  {
    name: 'weekly.2012-03-13',
    version: 'weekly.2012-03-13',
    installed: false,
    isDefault: false
  },
  { name: 'go1.23.9', version: '1.23.9', installed: true, isDefault: false }
])

assert.equal(isGvmVersionIdentifier('go1.24.5'), true)
assert.equal(isGvmVersionIdentifier('release.r60.3'), true)
assert.equal(isGvmVersionIdentifier('weekly.2012-03-13'), true)
assert.equal(isGvmVersionIdentifier('gvm'), false)
assert.equal(isGvmVersionIdentifier('go1.24.5;rm'), false)
assert.equal(
  quotePosixShell("/Users/Test O'Neil/.gvm/scripts/gvm"),
  "'/Users/Test O'\\''Neil/.gvm/scripts/gvm'"
)

console.log('go gvm tests passed')
