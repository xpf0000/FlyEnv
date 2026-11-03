import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ScopeCoordinator, type ScopeLease } from '../fork/ScopeCoordinator'
import type { ResolvedScope } from '../shared'

const a: ResolvedScope = Object.freeze({
  key: 'project:a',
  directory: '/fixture/a',
  projectId: 'a'
})
const b: ResolvedScope = Object.freeze({
  key: 'project:b',
  directory: '/fixture/b',
  projectId: 'b'
})
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

test('same-scope operations serialize while other scopes progress independently', async () => {
  const coordinator = new ScopeCoordinator()
  const gate = deferred()
  const events: string[] = []
  const first = coordinator.run(a, async () => {
    events.push('a1')
    await gate.promise
    events.push('a1-done')
  })
  const second = coordinator.run(a, async () => {
    events.push('a2')
  })
  await coordinator.run(b, async () => {
    events.push('b')
  })
  assert.deepEqual(events, ['a1', 'b'])
  gate.resolve()
  await Promise.all([first, second])
  assert.deepEqual(events, ['a1', 'b', 'a1-done', 'a2'])
})
test('cache retention preserves a generation; active/queued work cannot be reclaimed', async () => {
  const coordinator = new ScopeCoordinator()
  const release = coordinator.retain(a)
  let generation = ''
  await coordinator.run(a, async (lease) => {
    generation = lease.generation
  })
  const gate = deferred()
  const active = coordinator.run(a, async (lease) => {
    assert.equal(lease.generation, generation)
    await gate.promise
  })
  const queued = coordinator.run(a, async (lease) => {
    assert.equal(lease.generation, generation)
    lease.publishChange()
  })
  await tick()
  release()
  assert.equal(coordinator.size, 1)
  gate.resolve()
  await Promise.all([active, queued])
  assert.equal(coordinator.size, 0)
  await coordinator.run(a, async (lease) => {
    assert.notEqual(lease.generation, generation)
  })
})
test('unknown commits retain their coordinator until recovery explicitly confirms disk state', async () => {
  const coordinator = new ScopeCoordinator()
  const unknown = {
    id: 'record',
    operation: 'store' as const,
    request_id: 'request',
    request_digest: 'digest'
  }
  await coordinator.run(a, async (lease) => {
    lease.markUnknown(unknown)
  })
  assert.equal(coordinator.size, 1)
  await coordinator.run(a, async (lease) => {
    assert.deepEqual(lease.unknown, unknown)
    lease.clearUnknown()
  })
  assert.equal(coordinator.size, 0)
})
test('nested same-scope entry and use of an expired lease fail instead of splitting or deadlocking the queue', async () => {
  const coordinator = new ScopeCoordinator()
  let expired!: ScopeLease
  await coordinator.run(a, async (lease) => {
    expired = lease
    await assert.rejects(
      coordinator.run(a, async () => {}),
      /nested_scope_operation/
    )
  })
  assert.throws(() => expired.assertActive(), /scope_lease_expired/)
})
test('shutdown drains accepted work and rejects new operations', async () => {
  const coordinator = new ScopeCoordinator()
  const gate = deferred()
  const running = coordinator.run(a, async () => {
    await gate.promise
  })
  const close = coordinator.close()
  await assert.rejects(
    coordinator.run(b, async () => {}),
    /scope_coordinator_closed/
  )
  gate.resolve()
  await Promise.all([running, close])
})
