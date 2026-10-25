import { open, stat } from 'node:fs/promises'
import { ProcessListByExactPid, type PItem } from '@shared/Process'
import { compareProcessCreation, isReadableServiceStopRoot } from '@shared/ProcessSnapshot'
import { isWindows } from '@shared/utils'

export type OpenSearchStartupState = {
  list: PItem[]
  launcherCreated?: string
  serverPid?: string
}

const normalizePath = (value: string) => {
  const path = value.replace(/\\/g, '/').replace(/\/+$/, '')
  return isWindows() ? path.toLowerCase() : path
}

export function isOpenSearchServer(process: PItem, home: string, conf: string): boolean {
  if (!isReadableServiceStopRoot(process)) return false
  const windows = isWindows()
  const args = (
    process.COMMAND.match(windows ? /(?:[^\s"]+|"[^"]*")+/g : /(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ??
    []
  ).map((arg) =>
    arg.replace(
      windows ? /"([^"]*)"/g : /"([^"]*)"|'([^']*)'/g,
      (_match, double, single) => double ?? single
    )
  )
  const property = (name: string, expected: string) =>
    args.some(
      (arg) =>
        arg.startsWith(`-D${name}=`) &&
        normalizePath(arg.slice(name.length + 3)) === normalizePath(expected)
    )
  return (
    args.includes('org.opensearch.bootstrap.OpenSearch') &&
    property('opensearch.path.home', home) &&
    property('opensearch.path.conf', conf)
  )
}

export function hasOpenSearchStarted(log: string): boolean {
  if (
    /\[\s*(?:o\.o\.n\.Node|org\.opensearch\.node\.Node)\s*\]\s+\[[^\]\r\n]*\]\s+started(?:\s|$)/m.test(
      log
    )
  )
    return true
  return log.split(/\r?\n/).some((line) => {
    if (!line.startsWith('{')) return false
    try {
      const record = JSON.parse(line)
      return (
        ['o.o.n.Node', 'org.opensearch.node.Node'].includes(record.component ?? record.logger) &&
        record.message === 'started'
      )
    } catch {
      return false
    }
  })
}

/** Read only new log bytes from this attempt; old "started" lines cannot validate a new JVM. */
export async function startupLogReader(files: string[]): Promise<() => Promise<string>> {
  const cursors = await Promise.all(
    [...new Set(files)].map(async (file) => {
      const info = await stat(file).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
        throw error
      })
      return { file, position: info?.size ?? 0, ino: info?.ino, text: '' }
    })
  )
  return async () => {
    for (const cursor of cursors) {
      try {
        const info = await stat(cursor.file)
        if (info.ino !== cursor.ino || info.size < cursor.position) cursor.position = 0
        cursor.ino = info.ino
        const start = Math.max(cursor.position, info.size - 65_536)
        const length = info.size - start
        if (!length) continue
        const handle = await open(cursor.file, 'r')
        try {
          const buffer = Buffer.alloc(length)
          const { bytesRead } = await handle.read(buffer, 0, length, start)
          cursor.position = start + bytesRead
          cursor.text = (cursor.text + buffer.subarray(0, bytesRead).toString('utf8')).slice(
            -65_536
          )
        } finally {
          await handle.close()
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          cursor.text = `Cannot read startup log ${cursor.file}: ${(error as Error).message}`
        }
      }
    }
    return cursors
      .map((cursor) => (cursor.text ? `${cursor.file}:\n${cursor.text}` : ''))
      .filter(Boolean)
      .join('\n')
  }
}

/** Only an explicit start invokes this monitor; it never adopts a pre-existing external service. */
export async function waitForOpenSearchStartup(options: {
  launcherPid: string
  home: string
  conf: string
  state: OpenSearchStartupState
  readPid: () => Promise<string>
  listProcesses: () => Promise<PItem[]>
  readLogs: () => Promise<string>
  wait: () => Promise<unknown>
  timeoutMs?: number
}): Promise<string> {
  const deadline = Date.now() + (options.timeoutMs ?? 120_000)
  let details = ''
  const fail = async (reason: string): Promise<never> => {
    // A process can write its final stderr while the process snapshot is being read.
    const finalDetails = await options.readLogs().catch(() => details)
    throw new Error([reason, finalDetails.slice(-20_000)].filter(Boolean).join('\n'))
  }
  while (true) {
    details = await options.readLogs()
    const pid = await options.readPid()
    const list = await options.listProcesses()
    options.state.list = list
    const launcher = list.find((process) => process.PID === options.launcherPid)
    if (!launcher) return fail('OpenSearch startup process exited before the service became ready')
    if (!options.state.launcherCreated) options.state.launcherCreated = launcher.CREATED
    if (
      isWindows() &&
      compareProcessCreation(options.state.launcherCreated, launcher.CREATED) !== 0
    ) {
      return fail('Cannot verify the OpenSearch startup process identity')
    }
    if (pid) {
      if (!/^[1-9]\d*$/.test(pid)) return fail('OpenSearch wrote an invalid process ID')
      options.state.serverPid = pid
      const server = list.find((process) => process.PID === pid)
      if (!server) return fail(`OpenSearch JVM ${pid} exited before the service became ready`)
      const tree = ProcessListByExactPid(options.launcherPid, list)
      if (!tree.some((process) => process.PID === pid)) {
        return fail('The OpenSearch PID file does not belong to this startup')
      }
      if (isOpenSearchServer(server, options.home, options.conf)) {
        if (hasOpenSearchStarted(details)) return pid
      }
    }
    if (Date.now() >= deadline)
      return fail('OpenSearch did not become ready before the startup timeout')
    await options.wait()
  }
}
