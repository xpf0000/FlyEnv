import assert from 'node:assert/strict'
import { test } from 'node:test'
const identity = await import('../fork/processIdentity').catch(() => ({}) as any)
const locks = await import('../fork/locks').catch(() => ({}) as any)
test('selects only exact defaults-file values, including quoted Windows paths', () => {
  assert.equal(
    identity.hasExactDefaultsFile?.(
      '/mysql/bin/mysqld --defaults-file="/tmp/a b/my.cnf"',
      '/tmp/a b/my.cnf',
      false
    ),
    true
  )
  for (const text of [
    '/mysql/bin/mysqld --defaults-file=/tmp/a.cnf.other',
    '/mysql/bin/mysqld --other=/tmp/a.cnf',
    '/bin/sh -c "echo --defaults-file=/tmp/a.cnf"',
    '/mysql/bin/mysqld --defaults-extra-file=/tmp/a.cnf'
  ])
    assert.equal(identity.hasExactDefaultsFile(text, '/tmp/a.cnf', false), false)
  assert.equal(
    identity.hasExactDefaultsFile(
      '"C:\\My SQL\\mysqld.exe" --defaults-file="C:\\Data\\A.cnf"',
      'c:/data/a.cnf',
      true
    ),
    true
  )
})
test('only selects readable MySQL roots and does not stop other instances with the same executable', () => {
  const list = [
    { PID: '1', PPID: '0', COMMAND: '/mysql/bin/mysqld --defaults-file=/tmp/a.cnf' },
    { PID: '2', PPID: '0', COMMAND: '/mysql/bin/mysqld --defaults-file=/tmp/b.cnf' },
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
      '/mysql/bin/mysqld --defaults-file=/tmp/a b/my.cnf --init-file=/tmp/start.sql',
      '/tmp/a b/my.cnf',
      false
    ),
    true
  )
  const rows = [{ PID: '123', COMMAND: '/tmp/My SQL/bin/mysqld --defaults-file=/tmp/a b/my.cnf' }]
  assert.deepEqual(
    identity
      .selectInstanceRoots(rows, '/tmp/a b/my.cnf', false, '/tmp/My SQL/bin/mysqld')
      .map((p: any) => p.PID),
    ['123']
  )
  assert.equal(
    identity.hasExactDefaultsFile(
      '"C:\\My SQL\\mysqld.exe" "--defaults-file=C:\\My Data\\my.cnf"',
      'C:/My Data/my.cnf',
      true
    ),
    true
  )
})
test('Windows startup and cleanup select the exact instance before subsequent quoted options', () => {
  const bin =
    'D:\\Program Files\\PhpWebStudy-Data\\app\\mysql-26.7.0\\mysql-26.7.0-winx64\\bin\\mysqld.exe'
  const config =
    'D:\\Program Files\\PhpWebStudy-Data\\server\\mysql\\mysql-cluster\\instances\\node1\\my.cnf'
  for (const next of [
    '"--init-file=D:\\My Data\\initialize.sql"',
    "'--init-file=D:/My Data/initialize.sql'",
    '--read-only=ON'
  ]) {
    const command = `"${bin}" "--defaults-file=${config}" ${next}`
    const rows = [
      { PID: '123', PPID: '1', COMMAND: command },
      { PID: '124', PPID: '123', COMMAND: command },
      { PID: '125', PPID: '1', COMMAND: command.replace('node1', 'node2') },
      { PID: '126', PPID: '1', COMMAND: command.replace('my.cnf', 'my.cnf.other') },
      { PID: '127', PPID: '1', COMMAND: command.replace('mysql-26.7.0', 'other-installation') },
      { PID: '128', PPID: '1', COMMAND: `${command} "--defaults-file=${config}"` }
    ]
    assert.equal(identity.hasExactDefaultsFile(command, config, true), true)
    assert.deepEqual(
      identity.selectInstanceRoots(rows, config, true, bin).map((p: any) => p.PID),
      ['123', '124']
    )
  }
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
