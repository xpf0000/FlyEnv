import { createConnection } from 'mysql2/promise'
import type { Credential } from '../shared'
import type { InstanceCatalog } from './catalog'
export interface SqlSession { query(sql: string, params?: any[]): Promise<any[]> }
export function identifier(value: string): string {
  if (typeof value !== 'string' || !value || /[\0\r\n]/.test(value) || value.length > 64) throw new Error('Invalid SQL identifier')
  return '`' + value.replace(/`/g, '``') + '`'
}
export async function withInstanceConnection<T>(catalog: InstanceCatalog, id: string, credential: Credential, fn: (session: SqlSession) => Promise<T>): Promise<T> {
  const { spec } = await catalog.instance(id)
  if (!credential?.password || !credential.user) throw new Error('Instance credentials are required')
  let connection
  try {
    connection = await createConnection({ host: '127.0.0.1', port: spec.port, user: credential.user, password: credential.password, connectTimeout: 3000, multipleStatements: false })
    const [rows]: any = await connection.query('SELECT @@port AS port, @@datadir AS dataDir')
    const normalize = (s: string) => { const p = s.replace(/\\/g, '/').replace(/\/$/, ''); return catalog.platform === 'Windows' ? p.toLowerCase() : p }
    if (Number(rows[0].port) !== spec.port || normalize(rows[0].dataDir) !== normalize(spec.dataDir)) throw new Error('Connected database identity mismatch')
    const session: SqlSession = { async query(sql, params) {
      try { const [result] = await connection!.query({ sql, timeout: 30_000 }, params); return Array.isArray(result) ? result : [] }
      catch (error: any) { throw new Error(`MySQL operation failed (${error.code ?? 'SQL_ERROR'}); inspect instance status`) }
    } }
    return await fn(session)
  } catch (error: any) {
    if (error.code) throw new Error(`MySQL connection failed (${error.code}) on port ${spec.port}`)
    throw error
  } finally { if (connection) await connection.end().catch(() => undefined) }
}
export async function localAdmin<T>(session: SqlSession, task: () => Promise<T>): Promise<T> {
  await session.query('SET SESSION sql_log_bin=0')
  try { return await task() } finally { await session.query('SET SESSION sql_log_bin=1') }
}
