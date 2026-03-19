import { isWindows } from '@shared/utils'
import { shellEnv } from 'shell-env'
import { execPromise } from '@shared/child-process'

class EnvSync {
  AppEnv: Record<string, any> | undefined
  constructor() {}

  private async getWindowsAllEnv(): Promise<Record<string, string>> {
    try {
      /**
       * 这段 PowerShell 脚本做了三件事：
       * 1. 分别获取 Machine 和 User 级别的变量并合并到一个哈希表中。
       * 2. 遍历合并后的哈希表。
       * 3. 对每一个值调用 ExpandEnvironmentStrings，确保 %SystemRoot% 等被解析为真实路径。
       */
      const command = `powershell -NoProfile -Command "
      $envBlock = @{};
      [Array]$scopes = 'Machine','User';
      foreach($s in $scopes) {
        [Environment]::GetEnvironmentVariables($s).GetEnumerator() | % {
          $envBlock[$_.Key] = $_.Value
        }
      };
      $result = @{};
      foreach($key in $envBlock.Keys) {
        $result[$key] = [Environment]::ExpandEnvironmentStrings($envBlock[$key])
      };
      $result | ConvertTo-Json
    "`

      const output = (await execPromise(command, { encoding: 'utf8' }))?.stdout?.trim()
      return JSON.parse(output)
    } catch (e) {
      console.error('[EnvSync] Failed to fetch/expand Windows envs', e)
      return process.env as Record<string, string>
    }
  }

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
      const lastEnv = await this.getWindowsAllEnv()
      let path = `${lastEnv.PATH};C:\\Program Files\\RedHat\\Podman;C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\;%SYSTEMROOT%\\System32\\WindowsPowerShell\\v1.0\\`
      path = Array.from(new Set(path.split(';')))
        .filter((s) => !!s)
        .join(';')
      const env: any = { ...lastEnv, PATH: path }
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
