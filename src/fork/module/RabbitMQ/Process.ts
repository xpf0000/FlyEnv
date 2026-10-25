import { ProcessListByExactPid, type PItem } from '@shared/Process'
import { compareProcessCreation, isReadableServiceStopRoot } from '@shared/ProcessSnapshot'
import type { ServiceProcessIdentity } from '@shared/ServiceProcessIdentity'

/** Erlang loads RabbitMQ through ERL_LIBS, so its command need not contain the installation path. */
export function rabbitMQServiceTargets(identity: ServiceProcessIdentity, list: PItem[]) {
  const root = list.find((process) => process.PID === identity.pid)
  if (!root) return { pids: [], reason: 'absent', unknown: false }
  const order = compareProcessCreation(identity.created, root.CREATED)
  if (order !== undefined && order !== 0) {
    return { pids: [], reason: 'pid-reused', unknown: false }
  }
  if (
    order === undefined ||
    !Number.isFinite(identity.launchedAt) ||
    !Number.isFinite(identity.registeredAt) ||
    identity.registeredAt < identity.launchedAt ||
    !isReadableServiceStopRoot(root, true, false)
  ) {
    return { pids: [], reason: 'startup-identity-unavailable', unknown: true }
  }
  return {
    pids: ProcessListByExactPid(identity.pid, list).map((process) => process.PID),
    reason: 'startup-identity-matched',
    unknown: false
  }
}
