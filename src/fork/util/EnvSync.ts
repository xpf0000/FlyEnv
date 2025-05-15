import { join } from 'path'
import { chmod, copyFile } from 'fs-extra'
import { exec } from 'child-process-promise'
import { AppLogSend } from '../Fn'

class EnvSync {
  AppEnv: Record<string, any> | undefined
  constructor() {}

  async sync() {
    if (this.AppEnv) {
      return this.AppEnv
    }
    const file = join(global.Server.Cache!, 'env.sh')
    await copyFile(join(global.Server.Static!, 'sh/env.sh'), file)
    let text = ''
    try {
      await chmod(file, '0777')
      const res = await exec(`./env.sh`, {
        cwd: global.Server.Cache!,
        shell: '/bin/zsh'
      })
      text = res.stdout
    } catch (e: any) {
      AppLogSend('debug', `[env][sync][error]: ${e.toString()}`)
    }

    this.AppEnv = process.env
    text
      .toString()
      .trim()
      .split('\n')
      .forEach((l: string) => {
        const arr = l.split('=')
        const k = arr.shift()
        const v = arr.join('')
        if (k) {
          this.AppEnv![k] = v
        }
      })
    const PATH = `${this.AppEnv!['PATH']}:/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/Homebrew/bin:/opt/local/bin:/opt/local/sbin:/usr/local/bin:/usr/bin:/usr/sbin`
    this.AppEnv!['PATH'] = Array.from(new Set(PATH.split(':'))).join(':')
    if (global.Server.Proxy) {
      for (const k in global.Server.Proxy) {
        this.AppEnv![k] = global.Server.Proxy[k]
      }
    }
    return this.AppEnv!
  }
}

export default new EnvSync()
