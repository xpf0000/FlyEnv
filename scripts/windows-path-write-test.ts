import assert from 'node:assert/strict'
import {
  joinWindowsPathEntries,
  mergeWindowsPathPriority,
  splitWindowsPathEntries
} from '../src/fork/util/PATH.win'

async function main() {
  const rawPath =
    '; C:\\SDK\\bin;;relative\\tool;%INTEL_DEV_REDIST%redist\\intel64\\compiler;C:\\Tools\\;'
  const entries = splitWindowsPathEntries(rawPath)

  assert.deepEqual(entries, [
    '',
    ' C:\\SDK\\bin',
    '',
    'relative\\tool',
    '%INTEL_DEV_REDIST%redist\\intel64\\compiler',
    'C:\\Tools\\',
    ''
  ])
  assert.equal(joinWindowsPathEntries(entries), rawPath)

  const uncPath = '\\\\server\\share\\bin;;\\\\server\\share\\tools\\'
  const uncEntries = splitWindowsPathEntries(uncPath)
  assert.deepEqual(uncEntries, ['\\\\server\\share\\bin', '', '\\\\server\\share\\tools\\'])
  assert.equal(joinWindowsPathEntries(uncEntries), uncPath)

  const currentEntries = [
    '',
    'relative\\tool',
    'C:\\Tools\\',
    '',
    '%CUSTOM_BIN%',
    'D:\\FlyEnv\\bin'
  ]
  const merged = mergeWindowsPathPriority(currentEntries, ['d:\\flyenv\\bin', 'C:\\Tools'])

  assert.deepEqual(merged, [
    'd:\\flyenv\\bin',
    'C:\\Tools',
    '',
    'relative\\tool',
    '',
    '%CUSTOM_BIN%'
  ])

  console.log('windows path write test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
