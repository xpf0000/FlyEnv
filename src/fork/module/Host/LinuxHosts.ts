import Helper from '../../Helper'

export type LinuxHostsSnapshot = { content: string; digest: string }

export const readLinuxHosts = () => Helper.send<LinuxHostsSnapshot>('host', 'readHosts')

let pendingEdit: Promise<unknown> = Promise.resolve()
let closing = false

export function replaceLinuxHosts(content: string, digest: string): Promise<boolean> {
  if (closing) return Promise.reject(new Error('FlyEnv is closing; hosts editing is unavailable'))
  const operation = pendingEdit
    .catch(() => {})
    .then(() => Helper.send<boolean>('host', 'replaceHostsContent', { content, digest }))
  pendingEdit = operation
  return operation
}

export async function finishLinuxHostsEditing(): Promise<void> {
  closing = true
  await pendingEdit.catch(() => {})
}

/** Only automatic synchronization owns the FlyEnv block; editors own full text. */
export async function syncLinuxHosts(lines: string[] = []): Promise<boolean> {
  const snapshot = await readLinuxHosts()
  const entries = lines.map((line) => {
    const [ip, domain] = line.trim().split(/\s+/)
    return { ip, domain }
  })
  return Helper.send<boolean>('host', lines.length ? 'syncManagedEntries' : 'clearManagedEntries', {
    entries,
    digest: snapshot.digest
  })
}
