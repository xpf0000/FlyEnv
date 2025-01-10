import type { PtyItem } from '../type'
import { uuid } from '../utils'
import type { IPty } from 'node-pty'
import { spawn } from 'node-pty'
import { fixEnv } from '@shared/utils'

class NodePTY {
  pty: Partial<Record<string, PtyItem>> = {}
  private _callback: Function | undefined
  onSendCommand(callback: Function) {
    this._callback = callback
  }

  async initNodePty() {
    return new Promise(async (resolve) => {
      const key = uuid()
      const env = await fixEnv()
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
        this._callback?.(`NodePty:data:${key}`, `NodePty:data:${key}`, data)
        // const item = this.pty[key]
        // if (item) {
        //   item.data += data
        //   if (item?.data?.includes(`Task-${key}-End`)) {
        //     const task = item?.task ?? []
        //     for (const t of task) {
        //       const { command, key } = t
        //       this._callback?.(command, key, true)
        //     }
        //     this.exitPtyByKey(key)
        //   }
        // }
      })
      pty.onExit((e) => {
        console.log('this.pty.onExit !!!!!!', e)
        const item = this.pty[key]
        if (item) {
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

  exec(ptyKey: string, param: string[], command: string, key: string) {
    const pty = this.pty?.[ptyKey]?.pty
    console.log('exec: ', ptyKey, param, pty)
    param.forEach((s) => {
      pty?.write(`${s}\r`)
    })
    const task = this.pty?.[ptyKey]
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
