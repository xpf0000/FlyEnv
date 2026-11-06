import assert from 'node:assert/strict'
import { createHelper } from '../src/fork/Helper'

// Regression test for #788: raw PATH entries (e.g. "..\\relative") must not be rejected as path traversal.
async function main() {
  let fallbackArgs: unknown[] | undefined
  const helper = createHelper({
    isWindows: () => true,
    getWindowsElevationMethod: () => 'uac',
    runWindowsHelperFallback: async (_module, _fn, args) => {
      fallbackArgs = args
      return true
    }
  })

  const entries = ['%INTEL_DEV_REDIST%redist\\intel64\\compiler', '..\\relative', '']
  assert.equal(await helper.send('tools', 'setSystemPath', entries, {}, 'C:\\SDK\\bin;'), true)
  assert.deepEqual(fallbackArgs, [entries, {}, 'C:\\SDK\\bin;'])

  const path = 'C:\\SDK\\..\\SDK\\bin;'
  assert.equal(await helper.send('tools', 'setSystemPath', ['C:\\SDK\\bin'], {}, path), true)
  assert.deepEqual(fallbackArgs, [['C:\\SDK\\bin'], {}, path])

  await assert.rejects(
    helper.send('tools', 'writeFileByRoot', 'C:\\FlyEnv\\..\\outside.txt', 'x'),
    /Path traversal detected/
  )
  console.log('Windows helper path argument tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
