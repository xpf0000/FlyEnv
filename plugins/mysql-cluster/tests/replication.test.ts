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
