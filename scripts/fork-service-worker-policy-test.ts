import assert from 'node:assert/strict'
import { getDedicatedServiceTransition } from '../src/main/core/ForkWorkerPolicy'

for (const module of ['dns', 'ftp-srv']) {
  assert.equal(getDedicatedServiceTransition(module, 'startService', 0), 'pin')
  assert.equal(getDedicatedServiceTransition(module, 'stopService', 0), 'unpin')
  assert.equal(getDedicatedServiceTransition(module, 'startService', 1), undefined)
  assert.equal(getDedicatedServiceTransition(module, 'stopService', 1), undefined)
  assert.equal(getDedicatedServiceTransition(module, 'initConfig', 0), undefined)
}

assert.equal(getDedicatedServiceTransition('ollama', 'startService', 0), undefined)
assert.equal(getDedicatedServiceTransition('dns', 'stopService', 200), undefined)

console.log('fork dedicated service policy tests passed')
