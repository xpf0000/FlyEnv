import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openMemoryDirectory } from '../render/directory'

test('directory adapter accepts FlyEnv acknowledgement and Electron empty success result', async () => {
  const paths: string[] = []
  for (const response of [true, '']) {
    await openMemoryDirectory(async (path) => {
      paths.push(path)
      return response
    }, '/project with spaces')
  }
  assert.deepEqual(paths, ['/project with spaces', '/project with spaces'])
})

test('directory adapter reports errors and never retries the open request', async () => {
  let calls = 0
  await assert.rejects(
    openMemoryDirectory(async () => {
      calls++
      return 'Not found'
    }, '/missing'),
    /directory_unavailable/
  )
  assert.equal(calls, 1)
  await assert.rejects(
    openMemoryDirectory(async () => {
      throw new Error('transport failed')
    }, '/project'),
    /transport failed/
  )
})
