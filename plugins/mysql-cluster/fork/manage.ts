import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { access, mkdir, readFile, rm, rename } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import type { Credential, EventSink, ClusterMode, ItemOutcome } from '../shared'
import { summarize, errorText } from '../shared'
import type { InstanceCatalog } from './catalog'
import type { SqlSession } from './sql'
import { identifier, withInstanceConnection } from './sql'
import { writeAtomic } from './io'

export async function assertWritable(session: SqlSession, mode: ClusterMode) {
  const values = await session.query('SELECT @@GLOBAL.read_only AS readOnly, @@GLOBAL.super_read_only AS superReadOnly')
  if (!values[0] || Number(values[0].readOnly) || Number(values[0].superReadOnly)) throw new Error('This instance is read-only; use the writable primary')
  if (mode === 'group-replication') {
    const rows = await session.query('SELECT MEMBER_STATE, MEMBER_ROLE FROM performance_schema.replication_group_members WHERE MEMBER_ID=@@server_uuid')
    if (rows[0]?.MEMBER_STATE !== 'ONLINE' || rows[0]?.MEMBER_ROLE !== 'PRIMARY') throw new Error('The writable GR PRIMARY cannot be confirmed')
  }
}
export interface DatabaseInput { database: string; user: string; password: string; charset: string }
export async function createDatabase(session: SqlSession, data: DatabaseInput) {
  if (!data.user || !data.password || /[\0\r\n]/.test(data.user) || data.user.length > 32 || !['utf8mb4', 'utf8', 'latin1', 'ascii'].includes(data.charset)) throw new Error('Invalid database or user settings')
  const database = identifier(data.database)
  await session.query(`CREATE DATABASE IF NOT EXISTS ${database} CHARACTER SET ${data.charset}`)
  try {
    const existing = await session.query("SELECT User FROM mysql.user WHERE User=? AND Host='localhost'", [data.user])
    if (!existing.length) await session.query("CREATE USER ?@'localhost' IDENTIFIED BY ?", [data.user, data.password])
    await session.query(`GRANT ALL PRIVILEGES ON ${database}.* TO ?@'localhost'`, [data.user])
    return { database: data.database, user: data.user, userCreated: !existing.length }
  } catch { throw new Error('Database created; user creation or privileges failed. Inspect this database before retrying.') }
}
export function backupOptions(credential: Credential, port: number): string {
  const quote = (v: string) => {
    if (typeof v !== 'string' || v.includes('\0')) throw new Error('Invalid backup credential')
    return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"'
  }
  return `[client]\nhost=127.0.0.1\nprotocol=tcp\nport=${port}\nuser=${quote(credential.user)}\npassword=${quote(credential.password)}\n`
}
export async function listDatabases(catalog: InstanceCatalog, id: string, credential: Credential) {
  return withInstanceConnection(catalog, id, credential, async session => {
    const databases = await session.query("SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA WHERE SCHEMA_NAME NOT IN ('mysql','information_schema','performance_schema','sys') ORDER BY SCHEMA_NAME")
    const users = await session.query('SELECT User, Host FROM mysql.user ORDER BY User, Host')
    const grants = await session.query('SELECT Db, User FROM mysql.db')
    return { databases: databases.map(d => ({ name: d.name, users: [...new Set(grants.filter(g => g.Db.replace(/\\([_%])/g, '$1') === d.name).map(g => g.User))] })), users }
  })
}
export async function mutateDatabase(catalog: InstanceCatalog, id: string, credential: Credential, action: (s: SqlSession) => Promise<any>) {
  const { cluster } = await catalog.instance(id)
  if (cluster.mode === 'replication' && cluster.memberIds[0] !== id) throw new Error('Replica is read-only; use the source instance')
  return withInstanceConnection(catalog, id, credential, async session => { await assertWritable(session, cluster.mode); return action(session) })
}
export async function backupDatabase(catalog: InstanceCatalog, id: string, credential: Credential, databases: string[], destination: string, emit: EventSink) {
  if (!databases.length || !destination) throw new Error('Select databases and a backup directory')
  const { spec } = await catalog.instance(id)
  // Authenticate against this exact instance before launching the export tool.
  await withInstanceConnection(catalog, id, credential, async () => undefined)
  const dump = join(dirname(spec.engine.bin), catalog.platform === 'Windows' ? 'mysqldump.exe' : 'mysqldump')
  await access(dump); await mkdir(destination, { recursive: true })
  const credentialsFile = join(catalog.paths(id).dir, `backup-${randomUUID()}.cnf`)
  await writeAtomic(credentialsFile, backupOptions(credential, spec.port))
  const outcomes: ItemOutcome[] = []
  try {
    for (const database of databases) {
      identifier(database)
      const file = join(destination, `${encodeURIComponent(database).slice(0, 100)}-${Date.now()}-${randomUUID().slice(0, 8)}.sql`)
      emit({ operationId: id, instanceId: id, stage: 'backing-up', message: database })
      try {
        const child = spawn(dump, [`--defaults-file=${credentialsFile}`, '--single-transaction', '--routines', '--events', '--triggers', '--set-gtid-purged=OFF', '--databases', '--', database], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
        const exit = new Promise<void>((resolve, reject) => { child.once('error', () => reject(new Error('Cannot start mysqldump'))); child.once('close', code => code === 0 ? resolve() : reject(new Error('mysqldump failed'))) })
        try { await Promise.all([pipeline(child.stdout!, createWriteStream(file + '.partial', { mode: 0o600, flags: 'wx' })), exit]) }
        catch (error) { child.kill(); await exit.catch(() => undefined); throw error }
        await rename(file + '.partial', file)
        outcomes.push({ id: database, status: 'completed', stage: file })
      } catch (error) { await rm(file + '.partial', { force: true }).catch(() => undefined); outcomes.push({ id: database, status: 'failed', stage: 'backup', error: errorText(error) }) }
    }
  } finally { await rm(credentialsFile, { force: true }).catch(() => undefined) }
  return summarize(outcomes)
}
export async function readLog(catalog: InstanceCatalog, id: string, kind: 'error' | 'slow') {
  await catalog.instance(id)
  const file = kind === 'slow' ? catalog.paths(id).slow : catalog.paths(id).error
  try { return (await readFile(file)).subarray(-512_000).toString('utf8') }
  catch (error: any) { if (error.code === 'ENOENT') return ''; throw error }
}
