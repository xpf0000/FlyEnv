import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const api = await import('../fork/replication').catch(() => ({}) as any)
const sql = await import('../fork/sql').catch(() => ({}) as any)
test('replica status retains unknown lag and replication errors', () => {
  assert.deepEqual(
    api.replicaStatus?.({
      Slave_IO_Running: 'Yes',
      Slave_SQL_Running: 'Yes',
      Seconds_Behind_Master: null,
      Master_Port: 13307
    }),
    { state: 'recovering', role: 'REPLICA', lag: null, sourcePort: 13307, error: undefined }
  )
  const result = api.replicaStatus({
    Slave_IO_Running: 'Yes',
    Slave_SQL_Running: 'No',
    Seconds_Behind_Master: 9,
    Last_SQL_Error: 'duplicate key',
    Master_Port: 13307
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
test('configures a replica channel with MariaDB GTID slave_pos', async () => {
  assert.equal(typeof api.configureReplicaChannel, 'function')
  const commands: { sql: string; params?: unknown[] }[] = []
  const session = {
    async query(text: string, params?: unknown[]) {
      commands.push({ sql: text, params })
      return []
    }
  }
  await api.configureReplicaChannel(session, 13307, {
    user: 'flyenv_repl_g',
    password: 'p\'"$`'
  })
  const change = commands.find((c) => /CHANGE /.test(c.sql))!
  assert.match(
    change.sql,
    /^CHANGE MASTER TO MASTER_HOST='127\.0\.0\.1', MASTER_PORT=\?, MASTER_USER=\?, MASTER_PASSWORD=\?, MASTER_USE_GTID=slave_pos$/
  )
  assert.deepEqual(change.params, [13307, 'flyenv_repl_g', 'p\'"$`'])
  assert.match(commands.at(-2)!.sql, /^START SLAVE$/)
  assert.match(commands.at(-1)!.sql, /^SET GLOBAL read_only=ON$/)
  assert.ok(!commands.some((c) => /super_read_only/i.test(c.sql)))
})
test('retargets a managed replica port only for a local source', async () => {
  const commands: { sql: string; params?: unknown[] }[] = []
  const row = {
    Master_Host: '127.0.0.1',
    Master_Port: 13307,
    Slave_IO_Running: 'Yes',
    Slave_SQL_Running: 'Yes'
  }
  const session = {
    async query(sql: string, params?: unknown[]) {
      commands.push({ sql, params })
      return /^SHOW/.test(sql) ? [row] : []
    }
  }
  await api.configureReplicaChannel(session, 14306, { user: 'repl', password: 'secret' })
  assert.match(commands[1].sql, /^STOP SLAVE$/)
  assert.match(commands[2].sql, /^CHANGE MASTER TO MASTER_PORT=\?$/)
  assert.deepEqual(commands[2].params, [14306])
  assert.match(commands[3].sql, /^START SLAVE$/)
  commands.splice(0)
  row.Master_Host = '10.0.0.2'
  await assert.rejects(
    api.configureReplicaChannel(session, 14306, { user: 'repl', password: 'secret' }),
    /source/i
  )
  assert.equal(commands.length, 1)
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

test('account provisioning grants the replication user without touching write protection', async () => {
  const commands: string[] = []
  const session = {
    async query(text: string) {
      commands.push(text)
      return /^SELECT/.test(text) ? [] : []
    }
  }
  await api.ensureReplicationAccount(session, { user: 'repl', password: 'secret' })
  assert.ok(commands.some((text) => /^CREATE USER /.test(text)))
  assert.ok(commands.some((text) => /^GRANT REPLICATION SLAVE ON \*\.\*/.test(text)))
  assert.ok(!commands.some((text) => /super_read_only/i.test(text)))
})
