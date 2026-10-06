import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createAppHelperChecker, HelperVersion } from '../src/shared/AppHelperCheck'

let health: any = {
  version: HelperVersion,
  policyVersion: HelperVersion,
  policyUID: 501,
  healthy: true,
  pid: 1234
}
const methods: string[] = []
let connects = 0
const checker = createAppHelperChecker({
  isWindows: () => false,
  isLinux: () => false,
  getUnixUid: () => 501,
  getHelperKey: async () => Buffer.alloc(32),
  createConnection: ((path: string) => {
    connects++
    assert.equal(path, '/private/var/run/flyenv-helper/helper.sock')
    const socket = new EventEmitter() as any
    socket.destroy = () => socket
    socket.end = () => socket.emit('end')
    socket.write = (text: string) => {
      const request = JSON.parse(text)
      methods.push(request.function)
      assert.ok(request.sig, 'health requests must be signed')
      queueMicrotask(() =>
        socket.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              key: request.key,
              code: 0,
              data: request.function === 'version' ? HelperVersion : health
            })
          )
        )
      )
    }
    queueMicrotask(() => socket.emit('connect'))
    return socket
  }) as any
})
assert.equal(await checker(), true)
assert.deepEqual(methods, ['version', 'health'])
for (const patch of [
  { policyVersion: 41 },
  { policyUID: 502 },
  { healthy: false },
  { pid: 0 },
  { policyUID: undefined }
]) {
  const saved = health
  health = { ...health, ...patch }
  await assert.rejects(checker(), (error: any) => error.code === 'helper_health_invalid')
  health = saved
}
assert.equal(connects, 12, 'one version and one health query only per check')
for (const [key, code] of [
  [null, 'helper_key_missing'],
  [Buffer.alloc(31), 'helper_key_invalid']
] as const) {
  const checker = createAppHelperChecker({
    isWindows: () => false,
    isLinux: () => false,
    getHelperKey: async () => key,
    createConnection: (() => {
      throw new Error('key failure must stop before any connection')
    }) as any
  })
  await assert.rejects(checker(), (error: any) => error.code === code)
}
console.log(
  'macOS helper health: signed fixed transport, policy/account/version checks, key preflight passed'
)
