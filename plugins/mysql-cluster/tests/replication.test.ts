import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const api = await import('../fork/replication').catch(() => ({}) as any)
const sql = await import('../fork/sql').catch(() => ({}) as any)
test('old and new replica status fields retain unknown lag and replication errors', () => {
  assert.deepEqual(
    api.replicaStatus?.({
      Replica_IO_Running: 'Yes',
      Replica_SQL_Running: 'Yes',
      Seconds_Behind_Source: null,
      Source_Port: 13306
    }),
    { state: 'recovering', role: 'REPLICA', lag: null, sourcePort: 13306, error: undefined }
  )
  const result = api.replicaStatus({
    Slave_IO_Running: 'Yes',
    Slave_SQL_Running: 'No',
    Seconds_Behind_Master: 9,
    Last_SQL_Error: 'duplicate key',
    Master_Port: 13306
  })
  assert.equal(result.state, 'error')
  assert.equal(result.error, 'duplicate key')
})
test('never treats a missing replica channel as healthy', () => {
  assert.equal(api.replicaStatus?.(undefined).state, 'unknown')
})
test('generated replication credentials fit the server replication-channel limit and remain stable on retry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-secret-'))
  try {
    const account = await api.replicationAccount({ root }, { id: 'g' })
    assert.ok(account.password.length <= 32)
    assert.deepEqual(await api.replicationAccount({ root }, { id: 'g' }), account)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
test('escapes database identifiers and rejects NUL', () => {
  assert.equal(sql.identifier?.('a`b'), '`a``b`')
  assert.throws(() => sql.identifier('a\0b'), /identifier/i)
})
test('configures replica from verified source with the correct version dialect', async () => {
  assert.equal(typeof api.configureReplicaChannel, 'function')
  for (const version of ['8.0.22', '8.0.23', '8.4.8']) {
    const commands: { sql: string; params?: unknown[] }[] = []
    const session = {
      async query(text: string, params?: unknown[]) {
        commands.push({ sql: text, params })
        return []
      }
    }
    await api.configureReplicaChannel(session, version, 13306, {
      user: 'flyenv_repl_g',
      password: 'p\'"$`'
    })
    const change = commands.find((c) => /CHANGE /.test(c.sql))!
    assert.match(
      change.sql,
      version === '8.0.22' ? /CHANGE MASTER TO/ : /CHANGE REPLICATION SOURCE TO/
    )
    assert.equal(change.params?.includes('p\'"$`'), true)
    assert.match(commands.at(-1)!.sql, /super_read_only=ON/i)
  }
})
test('retargets a managed replica port only when the verified source UUID is unchanged', async () => {
  for (const version of ['8.0.22', '8.4.8']) {
    const commands: { sql: string; params?: unknown[] }[] = []
    const row =
      version === '8.0.22'
        ? {
            Master_Port: 13306,
            Master_UUID: 'source-uuid',
            Slave_IO_Running: 'Yes',
            Slave_SQL_Running: 'Yes'
          }
        : {
            Source_Port: 13306,
            Source_UUID: 'source-uuid',
            Replica_IO_Running: 'Yes',
            Replica_SQL_Running: 'Yes'
          }
    const session = {
      async query(sql: string, params?: unknown[]) {
        commands.push({ sql, params })
        return /^SHOW/.test(sql) ? [row] : []
      }
    }
    await api.configureReplicaChannel(
      session,
      version,
      14306,
      { user: 'repl', password: 'secret' },
      'source-uuid'
    )
    assert.match(commands[1].sql, /^STOP (REPLICA|SLAVE)$/)
    assert.match(commands[2].sql, /CHANGE .* TO (SOURCE|MASTER)_PORT=\?$/)
    assert.deepEqual(commands[2].params, [14306])
    assert.match(commands[3].sql, /^START (REPLICA|SLAVE)$/)
    commands.splice(0)
    await assert.rejects(
      api.configureReplicaChannel(
        session,
        version,
        14306,
        { user: 'repl', password: 'secret' },
        'different-source'
      ),
      /source/i
    )
    assert.equal(commands.length, 1)
  }
})
test('retries the required replication grant after CREATE succeeded and GRANT failed', async () => {
  let exists = false,
    creates = 0,
    grants = 0
  const session = {
    async query(sql: string) {
      if (/^SELECT @@GLOBAL.super_read_only/.test(sql)) return [{ superReadOnly: 0 }]
      if (/^SELECT/.test(sql)) return exists ? [{ User: 'repl' }] : []
      if (/^CREATE USER/.test(sql)) {
        exists = true
        creates++
      }
      if (/^GRANT/.test(sql) && ++grants === 1) throw new Error('grant unavailable')
      return []
    }
  }
  const account = { user: 'repl', password: 'secret' }
  await assert.rejects(api.ensureReplicationAccount(session, account), /grant unavailable/)
  await api.ensureReplicationAccount(session, account)
  assert.equal(creates, 1)
  assert.equal(grants, 2)
})

function protectedAccountSession(
  options: { grantFailure?: boolean; restoreFailure?: boolean } = {}
) {
  const state = { superReadOnly: true, exists: false, grants: 0, created: 0 }
  const session = {
    async query(text: string) {
      if (/^SELECT User/.test(text)) return state.exists ? [{ User: 'repl' }] : []
      if (/^SELECT @@GLOBAL.super_read_only/.test(text))
        return [{ superReadOnly: Number(state.superReadOnly) }]
      if (text === 'SET GLOBAL super_read_only=OFF') state.superReadOnly = false
      if (text === 'SET GLOBAL super_read_only=ON') {
        if (options.restoreFailure) throw new Error('restore unavailable')
        state.superReadOnly = true
      }
      if (/^(CREATE USER|GRANT)/.test(text) && state.superReadOnly)
        throw new Error('Writes blocked by super_read_only')
      if (/^CREATE USER/.test(text)) {
        state.exists = true
        state.created++
      }
      if (/^GRANT/.test(text)) {
        state.grants++
        if (options.grantFailure && state.grants === 1) throw new Error('grant unavailable')
      }
      assert.doesNotMatch(text, /^SET GLOBAL read_only=OFF$/)
      return []
    }
  }
  return { state, session }
}

test('explicit account provisioning restores a protected member after creating its replication user', async () => {
  const { state, session } = protectedAccountSession()
  await api.ensureReplicationAccount(session, { user: 'repl', password: 'secret' })
  assert.equal(state.created, 1)
  assert.equal(state.grants, 1)
  assert.equal(state.superReadOnly, true)
})

test('failed account grant restores member protection and remains retryable', async () => {
  const { state, session } = protectedAccountSession({ grantFailure: true })
  const account = { user: 'repl', password: 'secret' }
  await assert.rejects(api.ensureReplicationAccount(session, account), /grant unavailable/)
  assert.equal(state.superReadOnly, true)
  await api.ensureReplicationAccount(session, account)
  assert.equal(state.created, 1)
  assert.equal(state.grants, 2)
  assert.equal(state.superReadOnly, true)
})

test('account provisioning cannot hide a failure to restore member protection', async () => {
  const { session } = protectedAccountSession({ restoreFailure: true })
  await assert.rejects(
    api.ensureReplicationAccount(session, { user: 'repl', password: 'secret' }),
    /restore unavailable/
  )
})

test('account provisioning preserves both grant and protection restoration failures', async () => {
  const { session } = protectedAccountSession({ grantFailure: true, restoreFailure: true })
  await assert.rejects(
    api.ensureReplicationAccount(session, { user: 'repl', password: 'secret' }),
    (error: Error) =>
      /grant unavailable/.test(error.message) && /restore unavailable/.test(error.message)
  )
})

test('account provisioning preserves an originally writable source', async () => {
  const { state, session } = protectedAccountSession()
  state.superReadOnly = false
  await api.ensureReplicationAccount(session, { user: 'repl', password: 'secret' })
  assert.equal(state.superReadOnly, false)
  assert.equal(state.created, 1)
  assert.equal(state.grants, 1)
})

test('unknown member protection blocks account writes', async () => {
  let writes = 0
  const session = {
    async query(text: string) {
      if (!text.startsWith('SELECT')) writes++
      return []
    }
  }
  await assert.rejects(
    api.ensureReplicationAccount(session, { user: 'repl', password: 'secret' }),
    /Cannot determine member write protection/
  )
  assert.equal(writes, 0)
})
