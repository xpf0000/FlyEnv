import { appDebugLog, isMacOS } from '@shared/utils'
import Helper from '../../Helper'
import { resolve } from 'node:path'

export type UnixHostsSnapshot = { content: string; digest: string }

export const readUnixHosts = () => Helper.send<UnixHostsSnapshot>('host', 'readHosts')

let pendingEdit: Promise<unknown> = Promise.resolve()
let closing = false

async function refreshDNSAfterWrite(changed: boolean): Promise<boolean> {
  if (changed && isMacOS()) {
    try {
      await Helper.send('host', 'dnsRefresh')
    } catch (error) {
      // DNS and its diagnostics cannot reject or replay an already completed write.
      try {
        void appDebugLog(
          '[Host][dnsRefresh][error]',
          error instanceof Error ? (error.stack ?? error.message) : String(error)
        ).catch(() => {})
      } catch {}
    }
  }
  return changed
}

export function replaceUnixHosts(content: string, digest: string): Promise<boolean> {
  if (closing) return Promise.reject(new Error('FlyEnv is closing; hosts editing is unavailable'))
  if (!digest)
    return Promise.reject(new Error('Full hosts edits require the original snapshot digest'))
  const operation = pendingEdit
    .catch(() => {})
    .then(() =>
      Helper.send<boolean>('host', 'replaceHostsContent', {
        content,
        digest
      })
    )
    .then(refreshDNSAfterWrite)
  pendingEdit = operation
  return operation
}

export async function finishUnixHostsEditing(): Promise<void> {
  closing = true
  await pendingEdit.catch(() => {})
}

/** Only automatic synchronization owns the FlyEnv block; editors own full text. */
export function syncUnixHosts(lines: string[] = []): Promise<boolean> {
  if (closing && lines.length)
    return Promise.reject(new Error('FlyEnv is closing; hosts synchronization is unavailable'))
  const operation = pendingEdit
    .catch(() => {})
    .then(async () => {
      const snapshot = await readUnixHosts()
      const entries = lines.map((line) => {
        const [ip, domain] = line.trim().split(/\s+/)
        return { ip, domain }
      })
      return Helper.send<boolean>(
        'host',
        lines.length ? 'syncManagedEntries' : 'clearManagedEntries',
        {
          entries,
          digest: snapshot.digest
        }
      )
    })
    .then(refreshDNSAfterWrite)
  pendingEdit = operation
  return operation
}

export const isSystemHostsPath = (file: string): boolean => {
  const path = resolve(file)
  return path === '/etc/hosts' || (isMacOS() && path === '/private/etc/hosts')
}

/** Generic file APIs have no original edit snapshot and must not overwrite hosts. */
export function assertGenericUnixFileWrite(file: string): void {
  if (isSystemHostsPath(file))
    throw Object.assign(new Error('System hosts edits require the dedicated hosts editor'), {
      code: 'HOSTS_EDIT_REQUIRED'
    })
}
