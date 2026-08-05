import net from 'node:net'

export type LoopbackPortProbe = (port: number) => Promise<boolean>

export function canBindLoopback(port: number): Promise<boolean> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return Promise.resolve(false)
  }

  return new Promise((resolve) => {
    const server = net.createServer()
    let settled = false
    const finish = (available: boolean) => {
      if (settled) return
      settled = true
      server.removeAllListeners()
      try {
        server.close()
      } catch {}
      resolve(available)
    }
    server.once('error', () => finish(false))
    server.listen({ host: '127.0.0.1', port }, () => finish(true))
  })
}

export async function findLoopbackPort(
  start: number,
  count: number,
  max: number,
  excluded: readonly number[] = [],
  probe: LoopbackPortProbe = canBindLoopback
): Promise<number> {
  const first = Math.max(1, Math.trunc(start))
  const attempts = Math.max(0, Math.trunc(count))
  const upper = Math.min(65535, Math.trunc(max))
  const skipped = new Set(excluded)
  for (let offset = 0; offset < attempts; offset += 1) {
    const port = first + offset
    if (port > upper || skipped.has(port)) continue
    if (await probe(port)) return port
  }
  throw new Error(`No loopback port is available between ${first} and ${upper}`)
}
