import { markRaw } from 'vue'
import XTerm from '@/util/XTerm'
import { XTermExec } from '@/util/XTermExec'
import { reactiveBind } from '@/util/Index'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { MessageWarning } from '@/util/Element'
import { I18nT } from '@lang/index'

export class SudoKillTask extends XTermExec {
  private result?: { error?: unknown }
  private closing = false
  private mounting?: Promise<unknown>
  private closeOperation?: Promise<void>
  private resolveResult!: (value: boolean) => void
  private rejectResult!: (error: unknown) => void
  private completion: Promise<boolean>

  constructor(pids: string[], title: string) {
    super()
    const valid: string[] = []
    for (const pid of new Set(pids.map(String))) {
      if (!/^[1-9]\d*$/.test(pid) || Number(pid) <= 1 || Number(pid) > 2147483647) {
        MessageWarning(`Invalid PID: ${pid}`)
        continue
      }
      valid.push(pid)
    }
    if (!valid.length) throw new Error('No valid process IDs')
    this.title = title
    const success = I18nT('base.success').replace(/'/g, "'\\''")
    this.command = [
      `/usr/bin/sudo /bin/kill -9 -- ${valid.join(' ')}`,
      'flyenv_kill_exit_code=$?',
      `if [ "$flyenv_kill_exit_code" -eq 0 ]; then printf '\\033[32m%s\\033[0m\\n' '${success}'; fi`,
      'exit "$flyenv_kill_exit_code"'
    ]
    this.completion = new Promise((resolve, reject) => {
      this.resolveResult = resolve
      this.rejectResult = reject
    })
  }

  wait(): Promise<boolean> {
    return this.completion
  }

  async exec(dom: HTMLElement, command: string[]): Promise<void> {
    if (this.execing || this.closing) return
    this.execing = true
    const terminal = markRaw(new XTerm())
    this.xterm = terminal
    try {
      this.mounting = terminal.mount(dom)
      await this.mounting
      if (this.closing) return
      const result = await terminal.send([...command], 'direct', true)
      if (this.closing) return
      if (result !== true) throw new Error('Invalid terminal execution response')
      this.result = {}
    } catch (error) {
      if (this.closing) return
      this.result = { error }
      terminal.write(`\r\n${error instanceof Error ? error.message : String(error)}\r\n`)
    }
    if (!this.closing) this.execEnd = true
  }

  taskConfirm(): Promise<void> {
    return this.close()
  }

  taskCancel(): Promise<void> {
    return this.close()
  }

  abort(error: unknown): Promise<void> {
    if (!this.closing) this.result = { error }
    return this.close()
  }

  private close(): Promise<void> {
    if (this.closeOperation) return this.closeOperation
    // XTerm.stop resolves send(); set cancellation BEFORE stopping the PTY.
    this.closing = true
    const result = this.result ?? { error: new Error(I18nT('base.cancel')) }
    this.closeOperation = (async () => {
      try {
        // Initialization may create the PTY after the dialog has already closed.
        await this.mounting?.catch(() => {})
        // A failed exec acknowledgement can leave an initialized PTY alive.
        if (this.xterm?.ptyKey) await this.xterm.stop()
      } catch (error) {
        // Cleanup cannot undo a completed command, but must not hide its own failure.
        MessageWarning(error instanceof Error ? error.message : String(error))
      } finally {
        this.xterm?.destroy()
        delete this.xterm
        this.execing = false
        this.execEnd = false
        if (result.error !== undefined) this.rejectResult(result.error)
        else this.resolveResult(true)
      }
    })()
    return this.closeOperation
  }
}

let active: { signature: string; operation: Promise<boolean> } | undefined

export function runSudoKill(pids: string[], title: string): Promise<boolean> {
  if (window.Server.isWindows) return Promise.reject(new Error('sudo kill requires Unix'))
  const snapshot = [...new Set(pids.map(String))]
  const signature = JSON.stringify([...snapshot].sort())
  if (active) {
    if (active.signature === signature) return active.operation
    return Promise.reject(new Error('A sudo process stop is already running'))
  }
  let task: SudoKillTask
  try {
    task = reactiveBind(new SudoKillTask(snapshot, title))
  } catch (error) {
    return Promise.reject(error)
  }
  const operation = task.wait().finally(() => {
    active = undefined
  })
  active = { signature, operation }
  import('@/components/XTermExecDialog/index.vue')
    .then(({ default: Dialog }) => {
      // Dialog cancellation does not resolve AsyncComponentShow's submit promise.
      // The task owns completion for both confirmation and close.
      AsyncComponentShow(Dialog, { title, item: task, exitOnClose: true }).catch((error) =>
        task.abort(error)
      )
    })
    .catch((error) => task.abort(error))
  return operation
}
