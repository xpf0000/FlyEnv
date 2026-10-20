import type { ClusterSpec, Credentials, Credential, EventSink, ItemOutcome, ReplicationStatus } from '../shared'
import { errorText, summarize } from '../shared'
import type { InstanceCatalog } from './catalog'
import type { SqlSession } from './sql'
import { withInstanceConnection } from './sql'
import { replicationAccount, ensureReplicationAccount } from './replication'
import { chooseRecoveryCandidate } from './gtid'
import { OperationLocks } from './locks'

export async function withBootstrap<T>(session: SqlSession, start: () => Promise<T>): Promise<T> {
  await session.query('SET GLOBAL group_replication_bootstrap_group=ON')
  try { return await start() }
  finally {
    try { await session.query('SET GLOBAL group_replication_bootstrap_group=OFF') }
    catch { throw new Error('Failed to reset bootstrap to OFF; inspect the running member before retrying') }
  }
}
export interface GroupRecoveryPlan {
  groupId: string
  bootstrapId?: string
  memberIds: string[]
  histories: { id: string; executed: string; received: string }[]
}
export class GroupReplicationService {
  readonly locks = new OperationLocks()
  constructor(readonly catalog: InstanceCatalog) {}
  async status(id: string, credential: Credential): Promise<ReplicationStatus> {
    return withInstanceConnection(this.catalog, id, credential, async session => {
      const rows = await session.query('SELECT MEMBER_STATE, MEMBER_ROLE FROM performance_schema.replication_group_members WHERE MEMBER_ID=@@server_uuid')
      const row = rows[0]
      return { role: row?.MEMBER_ROLE === 'PRIMARY' ? 'PRIMARY' : row?.MEMBER_ROLE === 'SECONDARY' ? 'SECONDARY' : 'UNKNOWN',
        state: row?.MEMBER_STATE === 'ONLINE' ? 'online' : row?.MEMBER_STATE === 'RECOVERING' ? 'recovering' : 'error', lag: null,
        error: row?.MEMBER_STATE === 'ONLINE' ? undefined : `GR member is ${row?.MEMBER_STATE ?? 'OFFLINE'}` }
    })
  }
  async planRecovery(cluster: ClusterSpec, credentials: Credentials): Promise<GroupRecoveryPlan> {
    const histories: GroupRecoveryPlan['histories'] = []
    let active = false
    for (const id of cluster.memberIds) {
      await withInstanceConnection(this.catalog, id, credentials[id], async session => {
        const members = await session.query('SELECT MEMBER_STATE FROM performance_schema.replication_group_members WHERE MEMBER_ID=@@server_uuid')
        if (members.some(m => ['ONLINE', 'RECOVERING'].includes(m.MEMBER_STATE))) active = true
        const rows = await session.query('SELECT @@GLOBAL.gtid_executed AS executed')
        const received = await session.query("SELECT RECEIVED_TRANSACTION_SET AS received FROM performance_schema.replication_connection_status WHERE CHANNEL_NAME='group_replication_applier'")
        histories.push({ id, executed: rows[0]?.executed, received: received[0]?.received ?? '' })
      })
    }
    return { groupId: cluster.id, bootstrapId: active ? undefined : chooseRecoveryCandidate(histories), memberIds: [...cluster.memberIds], histories }
  }
  configure(cluster: ClusterSpec, credentials: Credentials, emit: EventSink) {
    return this.locks.run(cluster.id, 'group-replication', async () => {
      if (!cluster.groupUuid || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(cluster.groupUuid)) throw new Error('Invalid GR group UUID')
      const account = await replicationAccount(this.catalog, cluster)
      const members = await Promise.all(cluster.memberIds.map(id => this.catalog.instance(id)))
      const seeds = members.map(m => `127.0.0.1:${m.spec.groupPort}`).join(',')
      // Every member must be reachable before deciding whether bootstrap is safe.
      const plan = await this.planRecovery(cluster, credentials)
      for (const { spec } of members) {
        if ((await this.status(spec.id, credentials[spec.id])).state === 'online') continue
        await withInstanceConnection(this.catalog, spec.id, credentials[spec.id], async session => {
          const plugins = await session.query("SELECT PLUGIN_STATUS FROM information_schema.PLUGINS WHERE PLUGIN_NAME='group_replication'")
          if (plugins[0]?.PLUGIN_STATUS !== 'ACTIVE') throw new Error('Group Replication plugin is unavailable')
          await ensureReplicationAccount(session, account)
          await session.query('SET PERSIST group_replication_group_name=?', [cluster.groupUuid])
          await session.query('SET PERSIST group_replication_group_seeds=?', [seeds])
          await session.query("SET PERSIST group_replication_recovery_get_public_key=ON")
          await session.query("CHANGE REPLICATION SOURCE TO SOURCE_USER=?, SOURCE_PASSWORD=? FOR CHANNEL 'group_replication_recovery'", [account.user, account.password])
        })
      }
      const outcomes: ItemOutcome[] = []
      const order = plan.bootstrapId ? [plan.bootstrapId, ...cluster.memberIds.filter(id => id !== plan.bootstrapId)] : cluster.memberIds
      for (const id of order) {
        emit({ operationId: cluster.id, instanceId: id, stage: 'joining-group' })
        try {
          const current = await this.status(id, credentials[id])
          if (current.state !== 'online') await withInstanceConnection(this.catalog, id, credentials[id], async session => {
            const start = () => session.query('START GROUP_REPLICATION')
            if (id === plan.bootstrapId) await withBootstrap(session, start)
            else await start()
          })
          const deadline = Date.now() + 60_000
          let state = await this.status(id, credentials[id])
          while (state.state !== 'online' && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 500)); state = await this.status(id, credentials[id])
          }
          if (state.state !== 'online') throw new Error(state.error ?? 'GR member did not become ONLINE')
          outcomes.push({ id, status: 'completed', stage: 'group-replication' })
        } catch (error) {
          outcomes.push({ id, status: 'failed', stage: 'group-replication', error: errorText(error) })
          if (id === plan.bootstrapId) {
            outcomes.push(...order.filter(other => other !== id).map(other => ({ id: other, status: 'skipped' as const, stage: 'group-replication', error: 'Bootstrap did not complete safely' })))
            break
          }
        }
      }
      if (outcomes.every(o => o.status === 'completed')) {
        const statuses = await Promise.all(cluster.memberIds.map(id => this.status(id, credentials[id])))
        if (statuses.filter(s => s.role === 'PRIMARY').length !== 1) throw new Error('Group does not have exactly one PRIMARY')
      }
      return summarize(outcomes)
    })
  }
}
