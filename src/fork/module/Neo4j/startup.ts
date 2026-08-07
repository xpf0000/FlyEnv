import { ProcessListByExactPid, ProcessPidsByPid, type PItem } from '@shared/Process'

export type Neo4jStartupProcess = {
  PID: string
  PPID: string
  COMMAND: string
}

export type Neo4jStartupProcessState =
  | { status: 'ready' }
  | { status: 'exited'; message: string }
  | { status: 'command-changed'; message: string }
  | { status: 'server-command-missing'; message: string }

function normalizedCommand(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/["']/g, '').toLowerCase()
}

export function neo4jProcessCommandMatchesInstance(
  command: string,
  installationPath: string,
  configDir: string
): boolean {
  const normalized = normalizedCommand(command)
  const home = normalizedCommand(installationPath)
  const config = normalizedCommand(configDir)
  return normalized.includes(`--home-dir=${home}`) && normalized.includes(`--config-dir=${config}`)
}

/**
 * Return every process that must be terminated for one Neo4j instance.
 *
 * The recorded launcher PID is preferred, but PowerShell can exit while the
 * Neo4j Java wrapper and server remain alive. In that case recover the server
 * by its exact home/config arguments, include its installation-owned wrapper
 * ancestors, and include every descendant of the recovered Java PID.
 */
export function neo4jStopProcessPids(
  processes: readonly Neo4jStartupProcess[],
  startupPid: string,
  installationPath: string,
  configDir: string
): string[] {
  const installation = normalizedCommand(installationPath)
  const targets = new Set<string>()
  const processItems = processes as unknown as PItem[]
  const addTree = (pid: string) => {
    ProcessListByExactPid(pid, processItems).forEach((process) => {
      targets.add(process.PID)
    })
  }
  const rootPid = `${startupPid ?? ''}`.trim()
  const root = processes.find((process) => `${process.PID}`.trim() === rootPid)
  let recoveredFromMissingStartupPid = false
  if (root && normalizedCommand(root.COMMAND).includes(installation)) {
    addTree(rootPid)
  }

  for (const process of processes) {
    if (!neo4jProcessCommandMatchesInstance(process.COMMAND, installationPath, configDir)) {
      continue
    }
    let parentPid = `${process.PPID ?? ''}`.trim()
    const visitedParents = new Set<string>()
    while (parentPid && !visitedParents.has(parentPid)) {
      visitedParents.add(parentPid)
      const parent = processes.find((item) => `${item.PID}`.trim() === parentPid)
      if (!parent) {
        recoveredFromMissingStartupPid ||= !root && parentPid === rootPid
        break
      }
      if (parentPid === rootPid) {
        addTree(rootPid)
        break
      }
      if (!normalizedCommand(parent.COMMAND).includes(installation)) break
      targets.add(parentPid)
      parentPid = `${parent.PPID ?? ''}`.trim()
    }
    addTree(`${process.PID}`.trim())
  }

  if (recoveredFromMissingStartupPid) {
    const existingPids = new Set(processes.map((process) => `${process.PID}`.trim()))
    ProcessPidsByPid(rootPid, processItems)
      .filter((processPid) => existingPids.has(processPid))
      .forEach((processPid) => targets.add(processPid))
  }

  return Array.from(targets).filter(Boolean)
}

export function neo4jStartupProcessState(
  processes: readonly Neo4jStartupProcess[],
  startupPid: string,
  startupCommand: string,
  installationPath: string,
  configDir: string
): Neo4jStartupProcessState {
  const rootPid = `${startupPid}`.trim()
  const root = processes.find((process) => `${process.PID}`.trim() === rootPid)
  if (!root) {
    return {
      status: 'exited',
      message: `Neo4j startup process ${rootPid} exited before startup completed`
    }
  }
  if (root.COMMAND !== startupCommand) {
    return {
      status: 'command-changed',
      message: `Neo4j startup process ${rootPid} command changed before startup completed`
    }
  }
  const pids = new Set(
    ProcessListByExactPid(rootPid, processes as unknown as PItem[]).map((process) => process.PID)
  )
  if (
    !processes.some(
      (process) =>
        pids.has(`${process.PID}`.trim()) &&
        neo4jProcessCommandMatchesInstance(process.COMMAND, installationPath, configDir)
    )
  ) {
    return {
      status: 'server-command-missing',
      message: `Neo4j server command was not found for startup process ${rootPid}`
    }
  }
  return { status: 'ready' }
}

export type Neo4jStartupProcessWaitOptions = {
  startupPid: string
  startupCommand: string
  installationPath: string
  configDir: string
  listProcesses: () => Promise<Neo4jStartupProcess[]>
  wait: (milliseconds: number) => Promise<unknown>
  attempts?: number
  intervalMilliseconds?: number
}

export async function waitForNeo4jStartupProcess(
  options: Neo4jStartupProcessWaitOptions
): Promise<void> {
  const attempts = Math.max(1, options.attempts ?? 60)
  const intervalMilliseconds = options.intervalMilliseconds ?? 500
  let lastState: Neo4jStartupProcessState | undefined

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const state = neo4jStartupProcessState(
      await options.listProcesses(),
      options.startupPid,
      options.startupCommand,
      options.installationPath,
      options.configDir
    )
    if (state.status === 'ready') return
    if (state.status !== 'server-command-missing') throw new Error(state.message)
    lastState = state
    if (attempt + 1 < attempts) {
      await options.wait(intervalMilliseconds)
    }
  }

  throw new Error(
    lastState?.status === 'server-command-missing'
      ? lastState.message
      : 'Neo4j startup process was not ready'
  )
}
