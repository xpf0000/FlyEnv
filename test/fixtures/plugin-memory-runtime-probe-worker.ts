import { DataRootLease } from '../../src/fork/runtime/DataRootLease'
import { AtomicFile } from '../../plugins/ai-memory/fork/AtomicFile'
import { join } from 'node:path'
import { open, rename, unlink } from 'node:fs/promises'

const port = (process as any).parentPort
try {
  const lease = await DataRootLease.acquire(process.argv[2])
  const crashAt = process.argv[3]
  if (crashAt) {
    port.postMessage({ acquired: true, crashAt, pid: process.pid })
    const atomic = new AtomicFile({
      open: async (path, flags, mode) => {
        const file = await open(path, flags, mode)
        return {
          writeFile: async (bytes) => {
            await file.writeFile(bytes)
            if (crashAt === 'write') process.kill(process.pid, 'SIGKILL')
          },
          sync: async () => {
            await file.sync()
            if (crashAt === 'sync') process.kill(process.pid, 'SIGKILL')
          },
          close: () => file.close()
        }
      },
      rename: async (from, to) => {
        await rename(from, to)
        if (crashAt === 'rename') process.kill(process.pid, 'SIGKILL')
      },
      unlink
    })
    await atomic.replace(join(process.argv[2], 'crash.json'), '{"revision":2}')
    throw new Error('crash point not reached')
  }
  await new AtomicFile().replace(
    join(process.argv[2], 'probe.json'),
    JSON.stringify({ complete: true })
  )
  port.postMessage({
    acquired: true,
    pid: process.pid,
    node: process.versions.node,
    electron: process.versions.electron
  })
  const keepAlive = setInterval(() => {}, 1000)
  port.on('message', async (event: { data: string }) => {
    if (event.data !== 'close') return
    clearInterval(keepAlive)
    await lease.release()
    process.exit(0)
  })
} catch (error) {
  port.postMessage({ acquired: false, code: (error as { code?: string }).code || 'probe_failed' })
  setTimeout(() => process.exit(0), 20)
}
