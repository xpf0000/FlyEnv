import { isWindows } from '@shared/utils'
import { shellEnv } from 'shell-env'
import { execPromise } from '@shared/child-process'
import { join } from 'node:path'
import { existsSync, copyFileSync } from 'node:fs'
import * as process from 'node:process'
import JSON5 from 'json5'

class EnvSync {
  AppEnv: Record<string, any> | undefined
  constructor() {}

  /**
   * 调用@static/sh/Windows/env-get.ps1获取Windows环境变量
   * 该脚本会获取 Machine 和 User 级别的环境变量，并展开所有 %VARNAME% 格式的变量引用
   * @private
   */
  private async getWindowsAllEnv(): Promise<Record<string, string>> {
    const dest = join(global.Server.Cache!, 'env-get.ps1')
    if (!existsSync(dest)) {
      const src = join(global.Server.Static!, 'sh/env-get.ps1')
      try {
        copyFileSync(src, dest)
      } catch (e) {
        console.error('[EnvSync] Failed to copy env-get.ps1:', e)
        return process.env as any
      }
    }
    try {
      const command = `powershell -NoProfile -ExecutionPolicy Bypass -File "${dest}"`
      const { stdout } = await execPromise(command, { encoding: 'utf8' })
      return JSON5.parse(stdout.trim())
    } catch (e) {
      console.error('[EnvSync] Failed to fetch Windows env from script:', e)
      return process.env as any
    }
  }

  async sync() {
    if (this.AppEnv) {
      console.log('sync this.AppEnv exists !!!')
      return this.AppEnv
    }
    if (isWindows()) {
      console.time('EnvSync getWindowsAllEnv')
      const lastEnv = await this.getWindowsAllEnv()
      console.timeEnd('EnvSync getWindowsAllEnv')
      const paths: string[] = []
      lastEnv.PATH.split(';').forEach((path) => {
        const p = path.trim()
        if (p) {
          paths.push(p)
        }
      })
      process.env?.Path?.split(';')?.forEach((path) => {
        const p = path.trim()
        if (p) {
          paths.push(p)
        }
      })
      process.env?.PATH?.split(';')?.forEach((path) => {
        const p = path.trim()
        if (p) {
          paths.push(p)
        }
      })
      const extent = `C:\\Program Files\\RedHat\\Podman;C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\`
      extent.split(';').forEach((path) => {
        const p = path.trim()
        if (p) {
          paths.push(p)
        }
      })

      const path = Array.from(new Set(paths)).filter(Boolean).join(';')

      const env: any = { ...process.env, ...lastEnv, PATH: path, Path: path }
      if (global.Server.Proxy) {
        for (const k in global.Server.Proxy) {
          env[k] = global.Server.Proxy[k]
        }
      }
      this.AppEnv = env
      return this.AppEnv
    }

    this.AppEnv = await shellEnv()
    const PATH = `${this.AppEnv!['PATH']}:/opt/podman/bin:/home/linuxbrew/.linuxbrew/bin:$HOME/.linuxbrew/bin:/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/Homebrew/bin:/opt/local/bin:/opt/local/sbin:/usr/local/bin:/usr/bin:/usr/sbin`
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
