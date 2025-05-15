import type { PtyItem } from '../type'
import { uuid } from '../utils'
import type { IPty } from 'node-pty'
import { spawn } from 'node-pty'
import { basename, join } from 'path'
import { chmod, remove, writeFile } from 'fs-extra'
import { existsSync } from 'fs'
import EnvSync from './EnvSync'

class NodePTY {
  pty: Partial<Record<string, PtyItem>> = {}
  private _callback: Function | undefined
  onSendCommand(callback: Function) {
    this._callback = callback
  }

  async initNodePty() {
    return new Promise(async (resolve) => {
      const key = uuid()
      const env = await EnvSync.sync()
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
          if (!!global.Server.Password) {
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
    } catch (e) {}
    delete this.pty[key]
  }

  exitAllPty() {
    for (const key in this.pty) {
      this.exitPtyByKey(key)
    }
  }

  async exec(ptyKey: string, param: string[], command: string, key: string) {
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
