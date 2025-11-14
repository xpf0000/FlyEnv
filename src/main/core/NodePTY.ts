import type { PtyItem } from '../type'
import type { IPty } from 'node-pty'

import { uuid } from '../utils'
import { spawn } from 'node-pty'
import { basename, join } from 'path'
import { chmod, remove, writeFile } from '../utils'
import { existsSync, watch } from 'fs'
import EnvSync from '@shared/EnvSync'
import type { CallbackFn } from '@shared/app'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import { tmpdir } from 'node:os'

class NodePTY {
  pty: Partial<Record<string, PtyItem>> = {}
  private _callback: CallbackFn | undefined
  onSendCommand(callback: CallbackFn) {
    this._callback = callback
  }

  async initNodePty() {
    return new Promise(async (resolve) => {
      const key = uuid()
      if (isMacOS()) {
        const env = await EnvSync.sync()
        Object.assign(env!, {
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor'
        })
        const pty: IPty = spawn('zsh', [], {
          name: 'xterm-color',
          cols: 80,
          rows: 34,
          cwd: process.cwd(),
          env,
          encoding: 'utf8'
        })
        pty.onData((data: string) => {
          console.log('pty.onData: ', data)
          if (data.trim() === 'Password:') {
            if (global.Server.Password) {
              pty.write(`${global.Server.Password!}\r`)
            }
          }
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
              const { command, key } = t
              this._callback?.(command, key, true)
            }
            this.exitPtyByKey(key)
          }
        })
        this.pty[key] = {
          task: [],
          pty,
          data: ''
        }
      } else if (isWindows()) {
        const pty: IPty = spawn('powershell.exe', [], {
          name: 'xterm-color',
          cols: 80,
          rows: 34,
          cwd: process.cwd(),
          encoding: 'utf8'
        })
        const onEnd = () => {
          const item = this.pty[key]
          if (item) {
            const task = item?.task ?? []
            for (const t of task) {
              const { command, key } = t
              this._callback?.(command, key, true)
            }
            this.exitPtyByKey(key)
          }
        }
        pty.onData(async (data: string) => {
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
        const pty: IPty = spawn('bash', [], {
          name: 'xterm-color',
          cols: 80,
          rows: 34,
          cwd: process.cwd(),
          env,
          encoding: 'utf8'
        })
        pty.onData((data: string) => {
          console.log('pty.onData: ', data)
          if (data.trim() === 'Password:') {
            if (global.Server.Password) {
              pty.write(`${global.Server.Password!}\r`)
            }
          }
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
              const { command, key } = t
              this._callback?.(command, key, true)
            }
            this.exitPtyByKey(key)
          }
        })
        this.pty[key] = {
          task: [],
          pty,
          data: ''
        }
      }
      resolve(key)
    })
  }

  exitPtyByKey(key: string) {
    const item = this.pty[key]
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
    for (const key in this.pty) {
      this.exitPtyByKey(key)
    }
  }

  async exec(
    ptyKey: string,
    param: string[],
    execUseOneFile: boolean,
    command: string,
    key: string
  ) {
    if (!execUseOneFile) {
      const tmplFile = join(tmpdir(), ptyKey)
      await writeFile(tmplFile, '')
      const watcher = watch(tmplFile, () => {
        watcher.close()
        pty?.kill()
        remove(tmplFile).catch()
      })
      const pty = this.pty?.[ptyKey]?.pty
      param.forEach((s) => {
        pty?.write(`${s}\r`)
      })
      if (isWindows()) {
        pty?.write(`"END" | Out-File -FilePath "${tmplFile}"\r`)
      } else {
        pty?.write(`echo "END" > "${tmplFile}"\r`)
      }
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
      pty?.write(`cd "${global.Server.Cache!}" && ./${basename(file)} && wait && exit 0\r`)
      const task = this.pty?.[ptyKey]
      if (task) {
        task.execFile = file
      }
      task?.task?.push({
        command,
        key
      })
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
    const pty = this.pty?.[ptyKey]?.pty
    pty?.write(data)
  }

  clean(ptyKey: string) {
    const pty = this.pty?.[ptyKey]?.pty
    pty?.write('clear\r')
  }

  resize(ptyKey: string, { cols, rows }: any) {
    const pty = this.pty?.[ptyKey]?.pty
    pty?.resize(cols, rows)
  }

  stop(ptyKey: string) {
    this.exitPtyByKey(ptyKey)
  }
}

export default new NodePTY()
