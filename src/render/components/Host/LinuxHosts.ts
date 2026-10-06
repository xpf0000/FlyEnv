import IPC from '@/util/IPC'
import type { LinuxHostsSnapshot } from '../../../fork/module/Host/LinuxHosts'
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
export const readLinuxHosts = () => request<LinuxHostsSnapshot>('readHosts')

/** Keep typing made during a save; don't accept unseen external edits as its baseline. */
export function reconcileLinuxHostsSave(
  snapshot: LinuxHostsSnapshot,
  submitted: string,
  draft: string,
  previousDigest: string
): LinuxHostsSnapshot {
  if (draft === submitted) return snapshot
  return {
    content: draft,
    digest: snapshot.content === submitted ? snapshot.digest : previousDigest
  }
}

class LinuxHostsEditorController {
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

export const LinuxHostsEditor = reactiveBind(new LinuxHostsEditorController())
