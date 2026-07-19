import assert from 'node:assert/strict'
import { LazyRuntime } from '../src/main/core/lazy/LazyRuntime'
import { syncCapturerConfig } from '../src/main/core/lazy/OptionalRuntimes'

type TestConfig = {
  key: string[]
  name: string
}

type TestCapturer = {
  configUpdate(config: TestConfig): void
}

const configuredShortcutLoadsRuntime = async () => {
  let loads = 0
  const updates: TestConfig[] = []
  const runtime = new LazyRuntime<TestCapturer>(async () => {
    loads += 1
    return {
      configUpdate(config) {
        updates.push(config)
      }
    }
  })
  const config = { key: ['Control', 'Shift', 'A'], name: 'capture' }

  await syncCapturerConfig(runtime, config)

  assert.equal(loads, 1, 'a configured shortcut must load the capturer runtime')
  assert.deepEqual(updates, [config], 'the loaded runtime must receive the saved config')
}

const emptyShortcutStaysLazy = async () => {
  let loads = 0
  const runtime = new LazyRuntime<TestCapturer>(async () => {
    loads += 1
    return { configUpdate() {} }
  })

  await syncCapturerConfig(runtime, { key: [], name: 'capture' })

  assert.equal(loads, 0, 'an empty shortcut must not load the capturer runtime')
  assert.equal(runtime.peek(), undefined)
}

const loadedRuntimeReceivesEmptyShortcut = async () => {
  let loads = 0
  const updates: TestConfig[] = []
  const runtime = new LazyRuntime<TestCapturer>(async () => {
    loads += 1
    return {
      configUpdate(config) {
        updates.push(config)
      }
    }
  })
  await runtime.load()
  const config = { key: [], name: 'capture' }

  await syncCapturerConfig(runtime, config)

  assert.equal(loads, 1, 'an already loaded runtime must be reused')
  assert.deepEqual(updates, [config], 'an empty update must reach the loaded runtime')
}

const failedLoadCanRetry = async () => {
  let attempts = 0
  const updates: TestConfig[] = []
  const runtime = new LazyRuntime<TestCapturer>(async () => {
    attempts += 1
    if (attempts === 1) throw new Error('capturer load failed')
    return {
      configUpdate(config) {
        updates.push(config)
      }
    }
  })
  const config = { key: ['Control', 'Shift', 'A'], name: 'capture' }

  await assert.rejects(syncCapturerConfig(runtime, config), /capturer load failed/)
  await syncCapturerConfig(runtime, config)

  assert.equal(attempts, 2, 'a rejected lazy load must be retried')
  assert.deepEqual(updates, [config])
}

await configuredShortcutLoadsRuntime()
await emptyShortcutStaysLazy()
await loadedRuntimeReceivesEmptyShortcut()
await failedLoadCanRetry()

console.log('capturer shortcut startup tests passed')
