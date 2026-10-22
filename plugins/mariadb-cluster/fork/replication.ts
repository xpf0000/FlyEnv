import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  ClusterSpec,
  Credentials,
  Credential,
  EventSink,
  ReplicationStatus,
  ItemOutcome
} from '../shared'
import { errorText, summarize } from '../shared'
import type { InstanceCatalog } from './catalog'
import { writeAtomic } from './io'
import { localAdmin, withInstanceConnection } from './sql'
import type { SqlSession } from './sql'
import { OperationLocks } from './locks'

export function replicaStatus(row?: any): ReplicationStatus {
  if (!row)
    return {
      state: 'unknown',
      role: 'REPLICA',
      lag: null,
      error: 'Replica channel is not configured'
    }
  const io = row.Slave_IO_Running
  const sql = row.Slave_SQL_Running
  const raw = row.Seconds_Behind_Master
  const lag = raw === null || raw === undefined ? null : Number(raw)
  const error = row.Last_IO_Error || row.Last_SQL_Error || undefined
  return {
    state: error ? 'error' : io === 'Yes' && sql === 'Yes' && lag !== null ? 'online' : 'recovering',
    role: 'REPLICA',
    lag,
    sourcePort: Number(row.Master_Port) || undefined,
    error
  }
}
export async function configureReplicaChannel(
  session: SqlSession,
  sourcePort: number,
  account: Credential
) {
  const current = await session.query('SHOW SLAVE STATUS')
  const retarget = current.length && Number(current[0].Master_Port) !== sourcePort
  if (retarget) {
    // MariaDB has no source UUID; only a local source on this host may be retargeted.
    if (current[0].Master_Host !== '127.0.0.1')
      throw new Error('Existing replica channel points to another or unknown source')
    await session.query('STOP SLAVE')
    await session.query('CHANGE MASTER TO MASTER_PORT=?', [sourcePort])
  }
  if (!current.length)
    await session.query(
      "CHANGE MASTER TO MASTER_HOST='127.0.0.1', MASTER_PORT=?, MASTER_USER=?, MASTER_PASSWORD=?, MASTER_USE_GTID=slave_pos",
      [sourcePort, account.user, account.password]
    )
  if (
    retarget ||
    !current.length ||
    current[0].Slave_IO_Running !== 'Yes' ||
    current[0].Slave_SQL_Running !== 'Yes'
  )
    await session.query('START SLAVE')
  await session.query('SET GLOBAL read_only=ON')
}
export async function replicationAccount(
  catalog: InstanceCatalog,
  cluster: ClusterSpec
): Promise<Credential> {
  const file = join(catalog.root, 'groups', cluster.id, 'replication.json')
  try {
    const value = JSON.parse(await readFile(file, 'utf8'))
    if (typeof value.user !== 'string' || typeof value.password !== 'string' || !value.password)
      throw new Error('Invalid replication credentials')
    return value
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error
    const value = {
      user: `flyenv_${cluster.id.slice(0, 20)}`,
      password: randomBytes(16).toString('hex')
    }
    await writeAtomic(file, JSON.stringify(value))
    return value
  }
}
export async function ensureReplicationAccount(session: SqlSession, account: Credential) {
  const rows = await session.query(
    "SELECT User FROM mysql.user WHERE User=? AND Host='127.0.0.1'",
    [account.user]
  )
  await localAdmin(session, async () => {
    if (!rows.length)
      await session.query("CREATE USER ?@'127.0.0.1' IDENTIFIED BY ?", [
        account.user,
        account.password
      ])
    await session.query("GRANT REPLICATION SLAVE ON *.* TO ?@'127.0.0.1'", [account.user])
  })
}
export class ReplicationService {
  readonly locks = new OperationLocks()
  constructor(readonly catalog: InstanceCatalog) {}
  async status(id: string, credential: Credential): Promise<ReplicationStatus> {
    const { cluster } = await this.catalog.instance(id)
    if (cluster.memberIds[0] === id) return { state: 'online', role: 'SOURCE', lag: 0 }
    return withInstanceConnection(this.catalog, id, credential, async (s) =>
      replicaStatus((await s.query('SHOW SLAVE STATUS'))[0])
    )
  }
  configure(cluster: ClusterSpec, credentials: Credentials, emit: EventSink) {
    return this.locks.run(cluster.id, 'replication', () =>
      this.catalog.operations.runMany(cluster.memberIds, 'configure-replication', async () => {
        const source = await this.catalog.instance(cluster.memberIds[0])
        const account = await replicationAccount(this.catalog, cluster)
        // Source connectivity/account creation is a required prerequisite for every replica.
        // MariaDB has no server_uuid; a readable @@server_id verifies the source identity.
        await withInstanceConnection(
          this.catalog,
          source.spec.id,
          credentials[source.spec.id],
          async (s) => {
            await ensureReplicationAccount(s, account)
            const rows = await s.query('SELECT @@server_id AS serverId')
            if (!rows[0]?.serverId) throw new Error('Cannot verify source server ID')
          }
        )
        const outcomes: ItemOutcome[] = [
          { id: source.spec.id, status: 'completed', stage: 'replication' }
        ]
        for (const id of cluster.memberIds.slice(1)) {
          emit({ operationId: cluster.id, instanceId: id, stage: 'replicating' })
          try {
            await this.catalog.instance(id)
            await withInstanceConnection(this.catalog, id, credentials[id], (s) =>
              configureReplicaChannel(s, source.spec.port, account)
            )
            const deadline = Date.now() + 30_000
            let status: ReplicationStatus
            do {
              status = await this.status(id, credentials[id])
              if (status.state === 'online' || status.state === 'error') break
              await new Promise((resolve) => setTimeout(resolve, 300))
            } while (Date.now() < deadline)
            if (status!.state !== 'online')
              throw new Error(status!.error || 'Replica did not become healthy before timeout')
            outcomes.push({ id, status: 'completed', stage: 'replication' })
          } catch (error) {
            outcomes.push({ id, status: 'failed', stage: 'replication', error: errorText(error) })
          }
        }
        return summarize(outcomes)
      })
    )
  }
}
