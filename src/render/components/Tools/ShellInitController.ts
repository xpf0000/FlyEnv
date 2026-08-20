import { MessageError, MessageWarning } from '@/util/Element'
import { reactiveBind } from '@/util/Index'
import IPC from '@/util/IPC'
import { appHelperErrorFromIPC, isAppHelperUnavailableError } from '@shared/WindowsHelperState'

export type FlyEnvShellInitResult = {
  status: 'ready' | 'degraded'
  scriptPath: string
  scriptState: 'updated' | 'unchanged'
  profiles: Array<{
    edition: 'windows-powershell' | 'pwsh'
    path?: string
    state: 'updated' | 'unchanged' | 'skipped' | 'failed'
    reason?: string
  }>
  warnings: string[]
}

/**
 * Owns the FlyEnv PowerShell integration IPC lifecycle. It deliberately lives
 * in Tools because writing Profiles is not state owned by a language-project
 * page and can outlive that page.
 */
export class ShellInitController {
  running = false
  phase = 'idle'
  lastResult?: FlyEnvShellInitResult
  error = ''
  private inFlight?: Promise<FlyEnvShellInitResult | undefined>
  private lastWarningKey = ''

  ensure(): Promise<FlyEnvShellInitResult | undefined> {
    if (this.inFlight) return this.inFlight
    this.running = true
    this.phase = 'starting'
    this.error = ''
    const operation = this.invoke()
      .then((result) => {
        this.lastResult = result
        this.phase = result.status
        const warningKey = result.warnings.join('\n')
        if (warningKey && warningKey !== this.lastWarningKey) {
          this.lastWarningKey = warningKey
          MessageWarning(result.warnings.join('\n'))
        }
        return result
      })
      .catch((error: unknown) => {
        this.phase = 'failed'
        this.error = error instanceof Error ? error.message : `${error}`
        // Helper failures already trigger the global install/repair flow. Do
        // not surface the named-pipe implementation detail a second time.
        if (isAppHelperUnavailableError(error)) {
          return undefined
        }
        MessageError(this.error)
        return undefined
      })
      .finally(() => {
        this.running = false
        if (this.inFlight === operation) this.inFlight = undefined
      })
    this.inFlight = operation
    return operation
  }

  async syncAllowedDirs(dirs: string): Promise<void> {
    try {
      await new Promise<void>((resolve, reject) => {
        IPC.send('app-fork:tools', 'initAllowDir', dirs).then((key: string, response: any) => {
          if (response?.code === 200) return
          IPC.off(key)
          if (response?.code === 0) {
            resolve()
            return
          }
          reject(new Error(response?.msg ?? 'FlyEnv shell directory sync failed'))
        })
      })
    } catch (error) {
      MessageError(error instanceof Error ? error.message : `${error}`)
      throw error
    }
  }

  private invoke(): Promise<FlyEnvShellInitResult> {
    return new Promise((resolve, reject) => {
      IPC.send('app-fork:tools', 'initFlyEnvSH').then((key: string, response: any) => {
        if (response?.code === 200) {
          this.phase = response.msg || 'working'
          return
        }
        IPC.off(key)
        if (response?.code === 0 && response.data === true) {
          resolve({
            status: 'ready',
            scriptPath: '',
            scriptState: 'unchanged',
            profiles: [],
            warnings: []
          })
          return
        }
        if (response?.code === 0 && response.data) {
          resolve(response.data as FlyEnvShellInitResult)
          return
        }
        reject(
          appHelperErrorFromIPC(response) ??
            new Error(response?.msg ?? 'FlyEnv PowerShell integration failed')
        )
      })
    })
  }
}

export default reactiveBind(new ShellInitController())
