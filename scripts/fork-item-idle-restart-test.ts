import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { ForkItem } from '../src/main/core/ForkItem'
import {
  PRIMARY_FORK_IDLE_TIMEOUT_MS,
  TRANSIENT_FORK_IDLE_TIMEOUT_MS,
  type ForkIdleScheduler
} from '../src/main/core/ForkIdleLifecycle'

type FakeTimer = { callback: () => void; delayMs: number; cleared: boolean }

class FakeScheduler implements ForkIdleScheduler {
  timers: FakeTimer[] = []
  set(callback: () => void, delayMs: number) {
    const timer = { callback, delayMs, cleared: false }
    this.timers.push(timer)
    return timer as any
  }
  clear(timer: ReturnType<typeof setTimeout>) {
    ;(timer as any as FakeTimer).cleared = true
  }
  pending() {
    return this.timers.filter((timer) => !timer.cleared)
  }
  fire() {
    const timer = this.pending()[0]
    assert.ok(timer)
    timer.cleared = true
    timer.callback()
  }
}

class FakeChild extends EventEmitter {
  pid: number
  posts: any[] = []
  kills = 0
  constructor(pid: number) {
    super()
    this.pid = pid
  }
  postMessage(message: any) {
    this.posts.push(message)
  }
  kill() {
    this.kills += 1
  }
}

global.Server = { BaseDir: '/tmp/flyenv', Local: 'en' } as any
const bridge = { handle: () => false } as any
const scheduler = new FakeScheduler()
const children: FakeChild[] = []
const killedPids: number[] = []

const item = new ForkItem(
  '/tmp/fork.mjs',
  {
    idleTimeoutMs: PRIMARY_FORK_IDLE_TIMEOUT_MS,
    primary: true,
    idleScheduler: scheduler,
    forkProcess: () => {
      const child = new FakeChild(100 + children.length)
      children.push(child)
      return child as any
    },
    killProcess: (pid) => killedPids.push(pid)
  },
  bridge,
  bridge,
  bridge,
  () => ({ locale: 'en', messages: {} }) as any
)

const firstRequest = item.send('app', 'ping')
const firstChild = children[0]!
const firstCommand = firstChild.posts.at(-1) as any[]
firstChild.emit('message', { key: firstCommand[0], info: { code: 0, data: true } })
assert.deepEqual(await firstRequest, { code: 0, data: true })
assert.equal(item.activeTaskCount, 0)
assert.equal(item.isPrimary, true)
assert.equal(scheduler.pending()[0]?.delayMs, 180_000)

scheduler.fire()
assert.equal(firstChild.kills, 1)
assert.deepEqual(killedPids, [100])
assert.equal(item.isChildDisabled(), true)

const secondRequest = item.send('app', 'ping-again')
assert.equal(children.length, 2, 'an idle-killed child must respawn once')
const secondChild = children[1]!
const secondCommand = secondChild.posts.at(-1) as any[]
secondChild.emit('message', { key: secondCommand[0], info: { code: 0, data: 'again' } })
assert.deepEqual(await secondRequest, { code: 0, data: 'again' })
assert.equal(secondChild.posts[0]?.Server?.BaseDir, '/tmp/flyenv')

scheduler.fire()
assert.equal(secondChild.kills, 1)
assert.deepEqual(killedPids, [100, 101])
item.destroy()
assert.equal(secondChild.kills, 1, 'shutdown must not kill an already reclaimed child twice')
assert.deepEqual(killedPids, [100, 101])

const transientScheduler = new FakeScheduler()
let transientChild!: FakeChild
const transient = new ForkItem(
  '/tmp/fork.mjs',
  {
    idleTimeoutMs: TRANSIENT_FORK_IDLE_TIMEOUT_MS,
    primary: false,
    idleScheduler: transientScheduler,
    forkProcess: () => {
      transientChild = new FakeChild(200)
      return transientChild as any
    },
    killProcess: () => {}
  },
  bridge,
  bridge,
  bridge,
  () => undefined
)
const transientRequest = transient.send('version', 'allInstalledVersions')
const transientCommand = transientChild.posts.at(-1) as any[]
transientChild.emit('message', {
  key: transientCommand[0],
  info: { code: 0, data: {} }
})
await transientRequest
assert.equal(transientScheduler.pending()[0]?.delayMs, 10_000)

const serviceScheduler = new FakeScheduler()
const serviceChild = new FakeChild(300)
const service = new ForkItem(
  '/tmp/fork.mjs',
  {
    idleTimeoutMs: TRANSIENT_FORK_IDLE_TIMEOUT_MS,
    primary: false,
    idleScheduler: serviceScheduler,
    forkProcess: () => serviceChild as any,
    killProcess: () => {}
  },
  bridge,
  bridge,
  bridge,
  () => undefined
)
const startRequest = service.sendWithTerminalHook(() => service.pin(), 'dns', 'startService')
const startCommand = serviceChild.posts.at(-1) as any[]
serviceChild.emit('message', { key: startCommand[0], info: { code: 0, data: true } })
await startRequest
assert.equal(service.isPinned, true)
assert.equal(serviceScheduler.pending().length, 0, 'successful start must suppress idle kill')

const stopRequest = service.sendWithTerminalHook(() => service.unpin(), 'dns', 'stopService')
const stopCommand = serviceChild.posts.at(-1) as any[]
serviceChild.emit('message', { key: stopCommand[0], info: { code: 0, data: true } })
await stopRequest
assert.equal(service.isPinned, false)
assert.equal(serviceScheduler.pending()[0]?.delayMs, 10_000)

console.log('fork item idle restart tests passed')
