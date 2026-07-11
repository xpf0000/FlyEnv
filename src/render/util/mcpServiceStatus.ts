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
