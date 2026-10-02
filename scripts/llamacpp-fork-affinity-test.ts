import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import type { ForkManager as ForkManagerType } from '../src/main/core/ForkManager'

const { ForkManager } = createRequire(import.meta.url)('../src/main/core/ForkManager.ts') as {
  ForkManager: typeof ForkManagerType
}

const dispatched: Array<{ worker: number; method: string }> = []
let nextWorker = 0
const manager = Object.create(ForkManager.prototype) as {
  forks: unknown[]
  _on: () => void
  createForkItem: () => unknown
  send: (...args: unknown[]) => unknown
}
manager.forks = []
manager._on = () => {}
manager.createForkItem = () => {
  const worker = ++nextWorker
  return {
    activeTaskCount: 1,
    isPrimary: false,
    send: (_module: string, method: string) => {
      dispatched.push({ worker, method })
      return worker
    }
  }
}

manager.send('llama-cpp', 'downloadHubModelFile', 'download-1', { path: 'model.gguf' })
manager.send('llama-cpp', 'cancelModelDownload', 'download-1')

assert.equal(dispatched.length, 2)
assert.equal(dispatched[0].worker, dispatched[1].worker, 'cancel must reach the download owner')
assert.equal(dispatched[0].method, 'downloadHubModelFile')
assert.equal(dispatched[1].method, 'cancelModelDownload')
console.log('llama.cpp download Fork affinity test passed')
