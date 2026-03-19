import { isWindows } from '@shared/utils'
import { shellEnv } from 'shell-env'
import { execPromise } from '@shared/child-process'

class EnvSync {
  AppEnv: Record<string, any> | undefined
  constructor() {}

  /**
   * 动态获取 Windows 最新的 PATH 变量（绕过 process.env 缓存）
   * 合并 Machine 和 User 级别的 Path，并展开 %SystemRoot% 等变量
   */
  private async getWindowsLatestPath() {
    try {
      // 执行 PowerShell 获取最实时的 Path
      // [Environment]::GetEnvironmentVariable(名称, 范围)
      const command = `powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')"`
      const rawPath = (await execPromise(command, { encoding: 'utf8' }))?.stdout?.trim() ?? ''
      // 过滤重复项和空项
      return Array.from(new Set(rawPath.split(';')))
        .filter((s) => !!s)
        .join(';')
    } catch (e) {
      console.error('[EnvSync] Failed to fetch latest Windows PATH, fallback to process.env', e)
      return process.env['PATH'] || ''
    }
  }

  async sync() {
    if (this.AppEnv) {
      return this.AppEnv
    }
    if (isWindows()) {
      const sysPath = await this.getWindowsLatestPath()
      let path = `${sysPath};C:\\Program Files\\RedHat\\Podman;C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\;%SYSTEMROOT%\\System32\\WindowsPowerShell\\v1.0\\`
      path = Array.from(new Set(path.split(';')))
        .filter((s) => !!s)
        .join(';')
      const env: any = { ...process.env, PATH: path }
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
    // appDebugLog('[EnvSync][sync]', `${JSON.stringify(this.AppEnv, null, 2)}`).catch()
    return this.AppEnv!
  }
}

export default new EnvSync()
