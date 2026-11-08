import { spawn, type ChildProcess } from 'node:child_process'
import { isAbsolute } from 'node:path'
import { brewEnvironment, formulaName } from './UpgradeCatalog'
import type { BrewFormulaSnapshot, BrewPackageAction, BrewPackageResult } from './UpgradeTypes'

export class BrewPackageRunner {
  private active?: { id: string; child: ChildProcess; killTimer?: ReturnType<typeof setTimeout> }
  get activeId() {
    return this.active?.id
  }

  async runPackage(
    action: BrewPackageAction,
    snapshot: BrewFormulaSnapshot,
    operationId: string,
    onProgress: (data: string) => void = () => {},
    env = process.env
  ): Promise<BrewPackageResult> {
    if (this.active) throw new Error('Homebrew package runner is busy')
    if (!['upgrade', 'install', 'uninstall'].includes(action) || !isAbsolute(snapshot.identity.bin))
      throw new Error('Invalid package request')
    const formula = formulaName(snapshot.formula)
    return new Promise((resolve) => {
      const child = spawn(snapshot.identity.bin, [action, '--formula', formula], {
        env: brewEnvironment(env),
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32'
      })
      const active = {
        id: operationId,
        child,
        killTimer: undefined as ReturnType<typeof setTimeout> | undefined
      }
      this.active = active
      let logs = ''
      let spawnError: string | undefined
      let canceled = false
      const output = (data: Buffer) => {
        const text = data.toString()
        logs = (logs + text).slice(-65536)
        // Log presentation cannot change the package result or interrupt stdout draining.
        for (let i = 0; i < text.length; i += 8192) {
          try {
            onProgress(text.slice(i, i + 8192))
          } catch {}
        }
      }
      child.stdout!.on('data', output)
      child.stderr!.on('data', output)
      child.once('error', (error) => {
        spawnError = error.message
      })
      child.once('close', (code, signal) => {
        canceled = !!active.killTimer
        if (active.killTimer) clearTimeout(active.killTimer)
        if (this.active === active) this.active = undefined
        resolve({
          operationId,
          action,
          outcome: code === 0 && !spawnError && !canceled ? 'succeeded' : 'failed',
          code,
          signal,
          error:
            spawnError ||
            (canceled
              ? 'Homebrew command was terminated'
              : code !== 0 || signal
                ? `Homebrew exited with ${signal || code}`
                : undefined),
          logs
        })
      })
    })
  }

  cancel(id: string) {
    const active = this.active
    if (!active || active.id !== id || active.killTimer) return
    const signal = (value: NodeJS.Signals) => {
      try {
        if (process.platform !== 'win32' && active.child.pid) process.kill(-active.child.pid, value)
        else active.child.kill(value)
      } catch {}
    }
    active.killTimer = setTimeout(() => signal('SIGKILL'), 5000)
    signal('SIGTERM')
  }
}
