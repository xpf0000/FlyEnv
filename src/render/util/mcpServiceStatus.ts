type RunningInstance = {
  bin?: string
  path?: string
  version?: string | null
  pid?: string
}

type CurrentVersionLike = {
  version?: string | null
  bin?: string
  path?: string
}

type InstalledVersionLike = CurrentVersionLike & {
  pid?: string
  run?: boolean
  running?: boolean
}

type SyncServiceStatusFromMcpInput<
  TCurrent extends CurrentVersionLike,
  TInstalled extends InstalledVersionLike
> = {
  current?: TCurrent
  installed: TInstalled[]
  instances?: RunningInstance[]
  isOnlyRunOne?: boolean
}

const latestServiceRevision = new Map<string, number>()
const pendingServiceStatus = new Map<string, number>()

/** 标记 renderer 本地生命周期在途；空快照暂不覆盖它，终态通知会负责最终提交。 */
export function beginServiceStatusPending(flag: string): () => void {
  pendingServiceStatus.set(flag, (pendingServiceStatus.get(flag) ?? 0) + 1)
  let ended = false
  return () => {
    if (ended) return
    ended = true
    const count = (pendingServiceStatus.get(flag) ?? 1) - 1
    if (count > 0) pendingServiceStatus.set(flag, count)
    else pendingServiceStatus.delete(flag)
  }
}

/** IPC 生命周期终态可能先于/后于状态广播抵达；记住主进程提交时的版本号。 */
export function noteServiceStatusRevision(flag: string, revision: unknown) {
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) return
  latestServiceRevision.set(flag, Math.max(latestServiceRevision.get(flag) ?? -1, revision))
}

/** 只忽略已被终态消费过的旧广播；pending 时丢弃空广播但不推进版本号。 */
export function shouldApplyServiceStatusNotification(
  flag: string,
  revision: unknown,
  isEmpty: boolean
) {
  if (isEmpty && (pendingServiceStatus.get(flag) ?? 0) > 0) return false
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) return true
  if (revision <= (latestServiceRevision.get(flag) ?? -1)) return false
  latestServiceRevision.set(flag, revision)
  return true
}

export function syncServiceStatusFromMcp<
  TCurrent extends CurrentVersionLike,
  TInstalled extends InstalledVersionLike
>({
  current,
  installed,
  instances = [],
  isOnlyRunOne = false
}: SyncServiceStatusFromMcpInput<TCurrent, TInstalled>) {
  const runningByBin = new Map<string, RunningInstance>()
  instances.forEach((ins) => {
    if (ins?.bin) {
      runningByBin.set(ins.bin, ins)
    }
  })

  installed.forEach((item) => {
    if (item.running) {
      return
    }
    const hit = item.bin ? runningByBin.get(item.bin) : undefined
    if (hit) {
      item.run = true
      item.pid = hit.pid ? `${hit.pid}` : item.pid
    } else {
      item.run = false
      item.pid = ''
    }
  })

  if (installed.some((item) => item.running)) {
    return current
  }

  if (!isOnlyRunOne || instances.length !== 1) {
    return current
  }

  const running = installed.find((item) => item.bin && runningByBin.has(item.bin))
  if (!running) {
    return current
  }

  if (
    current?.version === running.version &&
    current?.path === running.path &&
    current?.bin === running.bin
  ) {
    return current
  }

  return { ...running }
}
