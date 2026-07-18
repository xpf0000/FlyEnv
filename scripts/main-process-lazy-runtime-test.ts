import assert from 'node:assert/strict'
import { LazyRuntime } from '../src/main/core/lazy/LazyRuntime'

let calls = 0
let release: ((value: { id: number }) => void) | undefined
const pending = new LazyRuntime(
  () =>
    new Promise<{ id: number }>((resolve) => {
      calls += 1
      release = resolve
    })
)

const first = pending.load()
const second = pending.load()
assert.equal(first, second, 'concurrent calls must share one promise')
assert.equal(calls, 1)
assert.equal(pending.peek(), undefined, 'peek must not expose an unresolved value')
release?.({ id: 7 })
assert.deepEqual(await first, { id: 7 })
assert.deepEqual(pending.peek(), { id: 7 })
assert.deepEqual(await pending.load(), { id: 7 })
assert.equal(calls, 1, 'resolved runtime must remain cached')

let attempts = 0
const retrying = new LazyRuntime(async () => {
  attempts += 1
  if (attempts === 1) throw new Error('first load failed')
  return { ready: true }
})

await assert.rejects(retrying.load(), /first load failed/)
assert.equal(retrying.peek(), undefined)
assert.deepEqual(await retrying.load(), { ready: true })
assert.equal(attempts, 2, 'a rejected import must be retryable')

let unloadedCalls = 0
const unloaded = new LazyRuntime(async () => {
  unloadedCalls += 1
  return true
})
assert.equal(unloaded.peek(), undefined)
assert.equal(unloadedCalls, 0, 'peek must never invoke the loader')

console.log('main process lazy runtime tests passed')
