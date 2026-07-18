import assert from 'node:assert/strict'
import {
  ForkIdleLifecycle,
  PRIMARY_FORK_IDLE_TIMEOUT_MS,
  TRANSIENT_FORK_IDLE_TIMEOUT_MS,
  type ForkIdleScheduler
} from '../src/main/core/ForkIdleLifecycle'

type FakeTimer = {
  callback: () => void
  delayMs: number
  cleared: boolean
}

class FakeScheduler implements ForkIdleScheduler {
  timers: FakeTimer[] = []

  set(callback: () => void, delayMs: number) {
    const timer: FakeTimer = { callback, delayMs, cleared: false }
    this.timers.push(timer)
    return timer as any
  }

  clear(timer: ReturnType<typeof setTimeout>) {
    ;(timer as any as FakeTimer).cleared = true
  }

  pending() {
    return this.timers.filter((timer) => !timer.cleared)
  }

  fire(timer = this.pending()[0]) {
    assert.ok(timer, 'a pending timer must exist')
    timer.cleared = true
    timer.callback()
  }
}

{
  const scheduler = new FakeScheduler()
  let idleCalls = 0
  const lifecycle = new ForkIdleLifecycle(
    PRIMARY_FORK_IDLE_TIMEOUT_MS,
    () => {
      idleCalls += 1
    },
    scheduler
  )

  lifecycle.taskStarted()
  lifecycle.taskSettled()
  assert.equal(scheduler.pending()[0]?.delayMs, 180_000)

  lifecycle.taskStarted()
  assert.equal(scheduler.pending().length, 0, 'new work must cancel the idle timer')
  lifecycle.taskSettled()
  scheduler.fire()
  assert.equal(idleCalls, 1)
}

{
  const scheduler = new FakeScheduler()
  let idleCalls = 0
  const lifecycle = new ForkIdleLifecycle(
    TRANSIENT_FORK_IDLE_TIMEOUT_MS,
    () => {
      idleCalls += 1
    },
    scheduler
  )

  lifecycle.taskStarted()
  lifecycle.taskStarted()
  lifecycle.taskSettled()
  assert.equal(scheduler.pending().length, 0, 'one active task must keep the worker alive')
  lifecycle.taskSettled()
  assert.equal(scheduler.pending()[0]?.delayMs, 10_000)

  lifecycle.pin()
  assert.equal(scheduler.pending().length, 0)
  lifecycle.unpin()
  scheduler.fire()
  assert.equal(idleCalls, 1)
}

{
  const scheduler = new FakeScheduler()
  let idleCalls = 0
  const lifecycle = new ForkIdleLifecycle(
    TRANSIENT_FORK_IDLE_TIMEOUT_MS,
    () => {
      idleCalls += 1
    },
    scheduler
  )

  lifecycle.taskStarted()
  lifecycle.pin()
  lifecycle.taskSettled()
  assert.equal(scheduler.pending().length, 0, 'a pinned service must not be reclaimed')

  lifecycle.childExited()
  assert.equal(lifecycle.activeTaskCount, 0)
  assert.equal(lifecycle.isPinned, false)

  lifecycle.taskStarted()
  lifecycle.taskSettled()
  lifecycle.dispose()
  assert.equal(scheduler.pending().length, 0, 'explicit destroy must cancel idle timers')
  assert.equal(idleCalls, 0)
}

console.log('fork idle lifecycle tests passed')
