import assert from 'node:assert/strict'
import { test } from 'node:test'
const api = await import('../fork/replication').catch(() => ({} as any))
const sql = await import('../fork/sql').catch(() => ({} as any))
test('old and new replica status fields retain unknown lag and replication errors', () => {
  assert.deepEqual(api.replicaStatus?.({ Replica_IO_Running: 'Yes', Replica_SQL_Running: 'Yes', Seconds_Behind_Source: null, Source_Port: 13306 }),
    { state: 'recovering', role: 'REPLICA', lag: null, sourcePort: 13306, error: undefined })
  const result = api.replicaStatus({ Slave_IO_Running: 'Yes', Slave_SQL_Running: 'No', Seconds_Behind_Master: 9, Last_SQL_Error: 'duplicate key', Master_Port: 13306 })
  assert.equal(result.state, 'error'); assert.equal(result.error, 'duplicate key')
})
test('never treats a missing replica channel as healthy', () => {
  assert.equal(api.replicaStatus?.(undefined).state, 'unknown')
})
test('escapes database identifiers and rejects NUL', () => {
  assert.equal(sql.identifier?.('a`b'), '`a``b`')
  assert.throws(() => sql.identifier('a\0b'), /identifier/i)
})
test('configures replica from verified source with the correct version dialect', async () => {
  assert.equal(typeof api.configureReplicaChannel, 'function')
  for (const version of ['8.0.22', '8.0.23', '8.4.8']) {
    const commands: { sql: string; params?: unknown[] }[] = []
    const session = { async query(text: string, params?: unknown[]) { commands.push({ sql: text, params }); return [] } }
    await api.configureReplicaChannel(session, version, 13306, { user: 'flyenv_repl_g', password: "p'\"$`" })
    const change = commands.find(c => /CHANGE /.test(c.sql))!
    assert.match(change.sql, version === '8.0.22' ? /CHANGE MASTER TO/ : /CHANGE REPLICATION SOURCE TO/)
    assert.equal(change.params?.includes("p'\"$`"), true)
    assert.match(commands.at(-1)!.sql, /super_read_only=ON/i)
  }
})
