import IPC from '@/util/IPC'
import type { UnixHostsSnapshot } from '../../../fork/module/Host/UnixHosts'
import { reactiveBind } from '@/util/Index'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'

function request<T>(method: string, ...args: string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    IPC.send('App-Node-FN', 'host', method, ...args).then(
      (key: string, res: { code: number; data: T; msg?: string }) => {
        IPC.off(key)
        if (res.code !== 0) reject(new Error(res.msg))
        else resolve(res.data)
      }
    )
  })
}
export const readUnixHosts = () => request<UnixHostsSnapshot>('readHosts')

/** Keep typing made during a save; don't accept unseen external edits as its baseline. */
export function reconcileUnixHostsSave(
  snapshot: UnixHostsSnapshot,
  submitted: string,
  draft: string,
  previousDigest: string
): UnixHostsSnapshot {
  if (draft === submitted) return snapshot
  return {
    content: draft,
    digest: snapshot.content === submitted ? snapshot.digest : previousDigest
  }
}

class UnixHostsEditorController {
  saving = false

  async save(content: string, digest: string): Promise<boolean> {
    if (this.saving) return false
    this.saving = true
    try {
      await request<void>('replaceHosts', content, digest)
      MessageSuccess(I18nT('base.success'))
      return true
    } catch (error) {
      MessageError(`${I18nT('base.hostsSaveFailed')}: ${error}`)
      return false
    } finally {
      this.saving = false
    }
  }
}

export const UnixHostsEditor = reactiveBind(new UnixHostsEditorController())
