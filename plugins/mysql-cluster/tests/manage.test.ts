import assert from 'node:assert/strict'
import { test } from 'node:test'
const api = await import('../fork/manage').catch(() => ({} as any))
test('read-only or unknown members cannot execute database management writes', async () => {
  assert.equal(typeof api.assertWritable, 'function')
  for (const mode of ['replication', 'group-replication']) {
    const s = { async query(sql: string) {
      if (sql.includes('super_read_only')) return [{ readOnly: 1, superReadOnly: 1 }]
      return [{ MEMBER_STATE: 'ONLINE', MEMBER_ROLE: 'SECONDARY' }]
    } }
    await assert.rejects(api.assertWritable(s, mode), /read.only|PRIMARY/i)
  }
})
test('backup option files keep literal secrets off argv and reject NUL', () => {
  const file = api.backupOptions?.({ user: 'root', password: 'a\\b"$`' }, 13306)
  assert.match(file ?? '', /port=13306/)
  assert.match(file, /password="a\\\\b\\"\$`"/)
  assert.throws(() => api.backupOptions({ user: 'root', password: 'a\0b' }, 13306), /credential/i)
})
test('database creation binds user values, escapes identifiers and keeps partial completion visible', async () => {
  const statements: string[] = []
  const session = { async query(sql: string) { statements.push(sql); if (sql.startsWith('CREATE USER')) throw new Error('user failed'); return [] } }
  await assert.rejects(api.createDatabase(session, { database: 'a`b', user: "x'", password: 'p', charset: 'utf8mb4' }), /database.*created/i)
  assert.equal(statements.some(sql => sql.includes('`a``b`')), true)
  assert.equal(statements.some(sql => sql.includes("x'")), false)
})
