import assert from 'node:assert/strict'
import { test } from 'node:test'
const identity = await import('../fork/processIdentity').catch(() => ({}) as any)
const locks = await import('../fork/locks').catch(() => ({}) as any)
test('selects only exact defaults-file values, including quoted Windows paths', () => {
  assert.equal(
    identity.hasExactDefaultsFile?.(
      '/mariadb/bin/mariadbd --defaults-file="/tmp/a b/my.cnf"',
      '/tmp/a b/my.cnf',
      false
    ),
    true
  )
  for (const text of [
    '/mariadb/bin/mariadbd --defaults-file=/tmp/a.cnf.other',
    '/mariadb/bin/mariadbd --other=/tmp/a.cnf',
    '/bin/sh -c "echo --defaults-file=/tmp/a.cnf"',
    '/mariadb/bin/mariadbd --defaults-extra-file=/tmp/a.cnf'
  ])
    assert.equal(identity.hasExactDefaultsFile(text, '/tmp/a.cnf', false), false)
  assert.equal(
    identity.hasExactDefaultsFile(
      '"C:\\Maria DB\\mariadbd.exe" --defaults-file="C:\\Data\\A.cnf"',
      'c:/data/a.cnf',
      true
    ),
    true
  )
})
test('only selects readable MariaDB roots and does not stop other instances with the same executable', () => {
  const list = [
    { PID: '1', PPID: '0', COMMAND: '/mariadb/bin/mariadbd --defaults-file=/tmp/a.cnf' },
    { PID: '2', PPID: '0', COMMAND: '/mariadb/bin/mariadbd --defaults-file=/tmp/b.cnf' },
    { PID: '3', PPID: '0', COMMAND: '' }
  ]
  assert.deepEqual(
    identity.selectInstanceRoots?.(list, '/tmp/a.cnf', false).map((p: any) => p.PID),
    ['1']
  )
})
test('recognizes OS process snapshots with unquoted space-containing config and executable paths', () => {
  assert.equal(
    identity.hasExactDefaultsFile(
      '/mariadb/bin/mariadbd --defaults-file=/tmp/a b/my.cnf --init-file=/tmp/start.sql',
      '/tmp/a b/my.cnf',
      false
    ),
    true
  )
  const rows = [{ PID: '123', COMMAND: '/tmp/Maria DB/bin/mariadbd --defaults-file=/tmp/a b/my.cnf' }]
  assert.deepEqual(
    identity
      .selectInstanceRoots(rows, '/tmp/a b/my.cnf', false, '/tmp/Maria DB/bin/mariadbd')
      .map((p: any) => p.PID),
    ['123']
  )
  assert.equal(
    identity.hasExactDefaultsFile(
      '"C:\\Maria DB\\mariadbd.exe" "--defaults-file=C:\\My Data\\my.cnf"',
      'C:/My Data/my.cnf',
      true
    ),
    true
  )
})
test('shares duplicate operations and rejects conflicting actions until the first finishes', async () => {
  assert.equal(typeof locks.OperationLocks, 'function')
  const lock = new locks.OperationLocks()
  let release!: () => void
  let calls = 0
  const work = () =>
    new Promise<void>((resolve) => {
      calls++
      release = resolve
    })
  const first = lock.run('a', 'start', work)
  const duplicate = lock.run('a', 'start', work)
  assert.equal(first, duplicate)
  await assert.rejects(
    lock.run('a', 'stop', async () => undefined),
    /busy/i
  )
  await Promise.resolve()
  release()
  await first
  assert.equal(calls, 1)
  await lock.run('a', 'stop', async () => {
    calls++
  })
  assert.equal(calls, 2)
})
test('multi-member operations exclude overlapping starts and release partially acquired locks on failure', async () => {
  const lock = new locks.OperationLocks()
  assert.equal(typeof lock.runMany, 'function')
  let release!: () => void
  const active = lock.runMany(
    ['b', 'a'],
    'edit',
    () =>
      new Promise<void>((r) => {
        release = r
      })
  )
  await new Promise((r) => setTimeout(r, 0))
  await assert.rejects(
    lock.run('b', 'start', async () => undefined),
    /busy/i
  )
  await assert.rejects(
    lock.runMany(['c', 'b'], 'remove', async () => undefined),
    /busy/i
  )
  await lock.run('c', 'start', async () => undefined)
  release()
  await active
  await lock.run('a', 'start', async () => undefined)
})
