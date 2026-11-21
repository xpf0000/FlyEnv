import type { PtyItem } from '../type'
import type { IPty } from 'node-pty'

import { uuid } from '../utils'
import { spawn } from 'node-pty'
import { basename, join } from 'path'
import { chmod, remove, writeFile } from '../utils'
import { existsSync, watch } from 'fs'
import EnvSync from '@shared/EnvSync'
import type { CallbackFn } from '@shared/app'
import { isLinux, isMacOS, isWindows, waitTime } from '@shared/utils'
import { ProcessKillStrict, ProcessListByExactPid, ProcessListFetch } from '@shared/Process'
import { waitForServiceProcessExit } from '@shared/ServiceStop'
import { tmpdir } from 'node:os'

type ExitResult = { exitCode: number; signal?: number; canceled: boolean }
type ExitOptions = { onStarted: () => void; onOutput: (data: string) => void }

class NodePTY {
  pty: Partial<Record<string, PtyItem>> = {}
  private _callback: CallbackFn | undefined
  onSendCommand(callback: CallbackFn) {
    this._callback = callback
  }

  async initNodePty() {
    const key = uuid()
    if (isMacOS()) {
      const env = await EnvSync.sync()
      Object.assign(env!, {
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      })
      const pty: IPty = spawn('/bin/zsh', [], {
        name: 'xterm-color',
        cols: 80,
        rows: 34,
        cwd: process.cwd(),
        env,
        encoding: 'utf8'
      })
      pty.onData((data: string) => {
        if (!this.pty?.[key] || this.pty?.[key]?.killed) {
          return
        }
        console.log('pty.onData: ', data)
        this._callback?.(`NodePty:data:${key}`, `NodePty:data:${key}`, data)
      })
      pty.onExit((e) => {
        console.log('this.pty.onExit !!!!!!', e)
        const item = this.pty[key]
        if (item) {
          const execFile = item?.execFile
          if (execFile && existsSync(execFile)) {
            remove(execFile).then().catch()
          }
          const task = item?.task ?? []
          for (const t of task) {
            this.completeTask(t, e.exitCode)
          }
          if (!item.waitForExit) this.exitPtyByKey(key)
        }
      })
      this.pty[key] = {
        task: [],
        pty,
        data: ''
      }
    } else if (isWindows()) {
      const env = await EnvSync.sync()
      Object.assign(env!, {
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      })
      const pty: IPty = spawn(EnvSync.PowerShellPath || 'powershell.exe', [], {
        name: 'xterm-color',
        cols: 80,
        rows: 34,
        env,
        cwd: process.cwd(),
        encoding: 'utf8'
      })
      const onEnd = () => {
        const item = this.pty[key]
        if (item) {
          const task = item?.task ?? []
          for (const t of task) {
            this.completeTask(t)
          }
          this.exitPtyByKey(key)
        }
      }
      pty.onData(async (data: string) => {
        if (!this.pty?.[key] || this.pty?.[key]?.killed) {
          return
        }
        this._callback?.(`NodePty:data:${key}`, `NodePty:data:${key}`, data)
        const item = this.pty[key]
        if (item) {
          item.data += data
          if (item?.data?.includes(`Task-${key}-End`)) {
            onEnd()
          }
        }
      })
      pty.onExit(async () => {
        onEnd()
      })
      this.pty[key] = {
        task: [],
        pty,
        data: ''
      }
    } else if (isLinux()) {
      const env = await EnvSync.sync()
      Object.assign(env!, {
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      })
      const pty: IPty = spawn('/bin/bash', [], {
        name: 'xterm-color',
        cols: 80,
        rows: 34,
        cwd: process.cwd(),
        env,
        encoding: 'utf8'
      })
      pty.onData((data: string) => {
        if (!this.pty?.[key] || this.pty?.[key]?.killed) {
          return
        }
        console.log('pty.onData: ', data)
        this._callback?.(`NodePty:data:${key}`, `NodePty:data:${key}`, data)
      })
      pty.onExit((e) => {
        console.log('this.pty.onExit !!!!!!', e)
        const item = this.pty[key]
        if (item) {
          const execFile = item?.execFile
          if (execFile && existsSync(execFile)) {
            remove(execFile).then().catch()
          }
          const task = item?.task ?? []
          for (const t of task) {
            this.completeTask(t, e.exitCode)
          }
          if (!item.waitForExit) this.exitPtyByKey(key)
        }
      })
      this.pty[key] = {
        task: [],
        pty,
        data: ''
      }
    }
    return key
  }

  private completeTask(task: PtyItem['task'][number], exitCode?: number) {
    const result = task.reportExitCode
      ? {
          code: exitCode === 0 ? 0 : 1,
          data: { exitCode },
          ...(exitCode === 0 ? {} : { msg: `Terminal exited with code ${exitCode ?? 'unknown'}` })
        }
      : true
    this._callback?.(task.command, task.key, result)
  }

  exitPtyByKey(key: string) {
    const item = this.pty[key]
    if (item) {
      item.killed = true
    }
    const execFile = item?.execFile
    if (execFile && existsSync(execFile)) {
      remove(execFile).then().catch()
    }
    try {
      if (item?.pty?.pid) {
        process.kill(item?.pty?.pid)
      }
      item?.pty?.kill()
    } catch {}
    delete this.pty[key]
  }

  exitAllPty() {
    this._callback = undefined
    for (const key in this.pty) {
      this.stop(key)
    }
  }

  /** Internal operations await real process exit independently of renderer listeners. */
  async execAndWait(ptyKey: string, param: string[]): Promise<void>
  async execAndWait(ptyKey: string, param: string[], options: ExitOptions): Promise<ExitResult>
  async execAndWait(
    ptyKey: string,
    param: string[],
    options?: ExitOptions
  ): Promise<ExitResult | void> {
    const item = this.pty[ptyKey]
    if (!item || item.killed || item.waitForExit) throw new Error('Terminal process is unavailable')
    const { pty } = item
    if (options) item.waitForExit = true
    return new Promise((resolve, reject) => {
      const output = options && pty.onData(options.onOutput)
      const exit = pty.onExit(async ({ exitCode, signal }) => {
        exit.dispose()
        output?.dispose()
        if (options) {
          const canceled = !!item.killTimer
          item.killed = true
          try {
            if (item.killTimer) {
              clearTimeout(item.killTimer)
              const children = await item.cancelChildren!
              // The PTY reports the leader's exit. A child can still be in its process group.
              const deadline = Date.now() + 5000
              let check: NodeJS.Signals | 0 = 'SIGKILL'
              while (true) {
                try {
                  process.kill(-pty.pid, check)
                } catch (error) {
                  const code = (error as NodeJS.ErrnoException).code
                  if (code === 'ESRCH') break
                  // On macOS, a group awaiting reaping can temporarily return EPERM.
                  if (code !== 'EPERM' || !isMacOS()) throw error
                }
                if (Date.now() >= deadline)
                  throw new Error('Could not confirm terminal process group exit')
                check = 0
                await waitTime(50)
              }
              await waitForServiceProcessExit(
                children.map(({ PID }) => PID),
                5000,
                {
                  initialList: children
                }
              )
            }
            resolve({ exitCode, signal, canceled })
          } catch (error) {
            reject(error)
          } finally {
            delete this.pty[ptyKey]
          }
        } else if (exitCode === 0) resolve()
        else reject(new Error(`Terminal exited with code ${exitCode}`))
      })
      try {
        // Fixed installation commands must not cross a writable outer script.
        this.writeDirect(pty, param, !!options)
      } catch (error) {
        output?.dispose()
        exit.dispose()
        if (options) this.exitPtyByKey(ptyKey)
        reject(error)
        return
      }
      try {
        options?.onStarted()
      } catch {}
    })
  }

  private writeDirect(pty: IPty, param: string[], replaceShell = false) {
    const literal = param.join('\n').replace(/'/g, "'\\''")
    // Keep the PTY process bound to the admitted command until its actual exit.
    if (replaceShell) pty.write(`exec /bin/sh -c '${literal}'\r`)
    else pty.write(`/bin/sh -c '${literal}'; exit $?\r`)
  }

  async exec(
    ptyKey: string,
    param: string[],
    execUseOneFile: boolean | 'direct',
    command: string,
    key: string,
    reportExitCode = false
  ) {
    if (!this.pty?.[ptyKey]?.pty || this.pty[ptyKey]?.waitForExit)
      throw new Error('Terminal process is unavailable')
    if (execUseOneFile === 'direct') {
      if (!isMacOS() && !isLinux()) throw new Error('Direct terminal execution requires Unix')
      const item = this.pty[ptyKey]!
      const task = { command, key, reportExitCode }
      item.task.push(task)
      try {
        this.writeDirect(item.pty, param)
      } catch (error) {
        item.task.splice(item.task.indexOf(task), 1)
        throw error
      }
      return
    }
    if (!execUseOneFile) {
      const tmplFile = join(tmpdir(), ptyKey)
      await writeFile(tmplFile, '')
      const watcher = watch(tmplFile, () => {
        watcher.close()
        pty?.kill()
        remove(tmplFile).catch()
      })
      const pty = this.pty?.[ptyKey]?.pty
      // ===== 修改的核心逻辑 =====
      if (isWindows()) {
        // Windows PowerShell 使用 ';' 按顺序执行
        const cmdStr = param.join(' ; ')
        pty?.write(`${cmdStr} ; "END" | Out-File -FilePath "${tmplFile}"\r`)
      } else {
        // macOS / Linux 使用 '&&' 确保前置命令成功后再执行下一步
        const cmdStr = param.join(' && ')
        pty?.write(`${cmdStr} && echo "END" > "${tmplFile}"\r`)
      }
      // ===========================

      const task = this.pty?.[ptyKey]
      task?.task?.push({
        command,
        key
      })
      return
    }
    if (isMacOS() || isLinux()) {
      const file = join(global.Server.Cache!, `${uuid()}.sh`)
      await writeFile(file, param.join('\n'))
      await chmod(file, '0777')
      const pty = this.pty?.[ptyKey]?.pty
      pty?.write(
        reportExitCode
          ? `cd "${global.Server.Cache!}" && ./${basename(file)}; exit $?\r`
          : `cd "${global.Server.Cache!}" && ./${basename(file)} && wait && exit 0\r`
      )
      const task = this.pty?.[ptyKey]
      if (task) task.execFile = file
      task?.task?.push({ command, key, reportExitCode })
    } else if (isWindows()) {
      const pty = this.pty?.[ptyKey]?.pty
      param.forEach((s) => {
        pty?.write(`${s}\r`)
      })
      const task = this.pty?.[ptyKey]
      task?.task?.push({
        command,
        key
      })
    }
  }

  write(ptyKey: string, data: string) {
    const item = this.pty?.[ptyKey]
    if (!item || item.killed) {
      return
    }
    // Ctrl+C in an awaited package command must also stop its build subprocesses.
    if (item.waitForExit && data === '\x03') {
      this.stop(ptyKey)
      return
    }
    item.pty.write(data)
  }

  clean(ptyKey: string) {
    const item = this.pty?.[ptyKey]
    if (!item || item.killed) {
      return
    }
    const pty = item?.pty
    pty?.write('clear\r')
  }

  resize(ptyKey: string, { cols, rows }: any) {
    const item = this.pty?.[ptyKey]
    if (!item || item.killed) {
      return
    }
    const pty = item?.pty
    pty?.resize(cols, rows)
  }

  stop(ptyKey: string) {
    const item = this.pty[ptyKey]
    if (item?.waitForExit) {
      if (item.cancelChildren) return
      const signal = (value: NodeJS.Signals) => {
        try {
          process.kill(-item.pty.pid, value)
        } catch {}
      }
      const stopGroup = () => {
        if (item.killed) return
        item.killTimer = setTimeout(() => signal('SIGKILL'), 5000)
        signal('SIGTERM')
      }
      item.cancelChildren = ProcessListFetch().then(
        async (list) => {
          if (item.killed) return []
          const root = String(item.pty.pid)
          const tree = ProcessListByExactPid(root, list)
          stopGroup()
          if (!tree.length) throw new Error('Cannot verify terminal process tree')
          // Homebrew can launch children in their own process groups.
          const children = tree.filter(({ PID }) => PID !== root)
          await ProcessKillStrict(
            'SIGKILL',
            children.map(({ PID }) => PID)
          )
          return children
        },
        (error) => {
          stopGroup()
          throw error
        }
      )
      item.cancelChildren.catch(() => {})
      return
    }
    this.exitPtyByKey(ptyKey)
  }
}

export default new NodePTY()
