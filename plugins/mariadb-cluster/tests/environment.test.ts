import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reactive } from 'vue'
const api = await import('../render/environment').catch(() => ({}) as any)

test('Homebrew discovery waits for the broadcast after the immediate command acknowledgement', async () => {
  const state = reactive({ cellar: '', cancelled: false })
  let completed = false
  const pending = api
    .waitForHomebrewDiscovery(
      () => state.cellar,
      () => state.cancelled,
      async () => true
    )
    .then(() => {
      completed = true
    })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(completed, false)
  state.cellar = '/opt/homebrew/Cellar'
  await pending
  assert.equal(completed, true)
})
test('Homebrew discovery cancels without waiting for a missing environment broadcast', async () => {
  const state = reactive({ cellar: '', cancelled: false })
  const pending = api.waitForHomebrewDiscovery(
    () => state.cellar,
    () => state.cancelled,
    async () => true
  )
  state.cancelled = true
  await assert.rejects(pending, /cancel/i)
})
test('Homebrew discovery failure is explicit when no installation was discovered', async () => {
  await assert.rejects(
    api.waitForHomebrewDiscovery(
      () => '',
      () => false,
      async () => true,
      5
    ),
    /not detected/i
  )
})
