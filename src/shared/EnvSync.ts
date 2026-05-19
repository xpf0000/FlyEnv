import { appDebugLog, isWindows } from '@shared/utils'
import { shellEnv } from 'shell-env'
import { execPromise } from '@shared/child-process'
import { dirname, join, isAbsolute } from 'node:path'
import { existsSync, copyFileSync } from 'node:fs'
import * as process from 'node:process'
import JSON5 from 'json5'

class EnvSync {
  AppEnv: Record<string, any> | undefined
  CMDPath: string | undefined
  PowerShellPath: string | undefined
  SystemPath: string | undefined
  timer: NodeJS.Timeout | undefined | null

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
    const findEnvByKey = (key: string): string | undefined => {
      const lowKey = key.toLowerCase()
      for (const k in process.env) {
        const lowEnvKey = k.toLowerCase()
        if (lowKey === lowEnvKey) {
          return process.env[k]
        }
      }
      return undefined
    }

    let stdout = ''
    let cmd = ''
    let systemPath = `C:\\Windows\\System32`
    const cmdDefault = `C:\\Windows\\System32\\cmd.exe`
    const ComSpec = findEnvByKey('ComSpec')
    const SystemRoot = findEnvByKey('SystemRoot')
    if (ComSpec) {
      cmd = ComSpec
      systemPath = dirname(cmd)
    } else if (SystemRoot) {
      systemPath = join(SystemRoot, 'System32')
      cmd = join(SystemRoot, 'System32/cmd.exe')
    } else if (existsSync(cmdDefault)) {
      cmd = cmdDefault
      systemPath = dirname(cmd)
    } else {
      cmd = 'cmd.exe'
      systemPath = `C:\\Windows\\System32`
    }
    this.SystemPath = systemPath
    let powershell = ''
    const powershellDefault = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    if (SystemRoot) {
      powershell = join(SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe')
    } else if (existsSync(powershellDefault)) {
      powershell = powershellDefault
    } else {
      powershell = 'powershell.exe'
    }
    try {
      const command = `"${powershell}" -NoProfile -ExecutionPolicy Bypass -File "${dest}"`
      const res = await execPromise(command, { encoding: 'utf8', shell: cmd })
      stdout = res?.stdout?.trim() ?? ''
    } catch (e) {
      console.error('[EnvSync] Failed to fetch Windows env from script:', e)
      appDebugLog(`[EnvSync][getWindowsAllEnv][error]`, `${e}`).catch()
      return process.env as any
    }
    if (!stdout) {
      return process.env as any
    }
    try {
      return JSON5.parse(stdout)
    } catch {}
    try {
      return JSON.parse(stdout)
    } catch {
      appDebugLog(`[EnvSync][getWindowsAllEnv][parse][error]`, `${stdout}`).catch()
      return process.env as any
    }
  }

  // 获取 Windows下的各种路径. 防止因为用户系统环境变量设置问题导致找不到可执行文件
  private fetchWinPaths() {
    // 查找 CMD 路径
    const fetchCMDPath = () => {
      if (this.CMDPath) {
        return
      }
      const cmdPath = `C:\\Windows\\System32\\cmd.exe`
      // 绝对路径
      if (existsSync(cmdPath)) {
        this.CMDPath = cmdPath
        return
      }
      // 系统ComSpec变量
      if (this.AppEnv?.ComSpec && existsSync(this.AppEnv?.ComSpec)) {
        this.CMDPath = this.AppEnv?.ComSpec
        return
      }
      // 系统SystemRoot变量
      if (this.AppEnv?.SystemRoot && existsSync(this.AppEnv?.SystemRoot)) {
        this.CMDPath = join(this.AppEnv?.SystemRoot, 'System32/cmd.exe')
        return
      }
      // 从 AppEnv 里找小写key
      for (const k in this.AppEnv) {
        const lowKey = k.toLowerCase()
        if (lowKey === 'comspec' && existsSync(this.AppEnv?.[k])) {
          this.CMDPath = this.AppEnv?.[k]
          return
        }
        if (lowKey === 'systemroot' && existsSync(this.AppEnv?.[k])) {
          this.CMDPath = join(this.AppEnv?.[k], 'System32/cmd.exe')
          return
        }
      }
    }
    // 查找 PowerShell 路径
    const fetchPowerShellPath = () => {
      if (this.PowerShellPath) {
        return
      }
      const powershellPath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
      if (existsSync(powershellPath)) {
        this.PowerShellPath = powershellPath
        return
      }
      for (const k in this.AppEnv) {
        const lowKey = k.toLowerCase()
        if (lowKey === 'systemroot' && existsSync(this.AppEnv?.[k])) {
          this.PowerShellPath = join(
            this.AppEnv?.[k],
            'System32/WindowsPowerShell/v1.0/powershell.exe'
          )
          return
        }
        if (lowKey === 'programfiles' && existsSync(this.AppEnv?.[k])) {
          this.PowerShellPath = join(this.AppEnv?.[k], 'PowerShell/7/pwsh.exe')
          return
        }
        if (lowKey === 'programfiles(x86)' && existsSync(this.AppEnv?.[k])) {
          this.PowerShellPath = join(this.AppEnv?.[k], 'PowerShell/7/pwsh.exe')
          return
        }
      }
    }
    fetchCMDPath()
    fetchPowerShellPath()
  }

  async sync() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    // 5分钟后清理。 处理常驻进程的无法刷新的问题
    this.timer = setTimeout(
      () => {
        this.clean()
      },
      1000 * 60 * 5
    )
    if (this.AppEnv) {
      console.log('sync this.AppEnv exists !!!')
      return this.AppEnv
    }
    if (isWindows()) {
      console.time('EnvSync getWindowsAllEnv')
      let lastEnv: Record<string, string> = {}
      try {
        lastEnv = await this.getWindowsAllEnv()
      } catch {}
      console.timeEnd('EnvSync getWindowsAllEnv')
      const keys = ['PATH', 'Path', 'path']
      const paths: string[] = []
      for (const key of keys) {
        lastEnv?.[key]?.split(';')?.forEach((path) => {
          const p = path.trim()
          if (p) {
            paths.push(p)
          }
        })
      }
      for (const key of keys) {
        process.env?.[key]?.split(';')?.forEach((path) => {
          const p = path.trim()
          if (p) {
            paths.push(p)
          }
        })
      }

      const systemPath = `C:\\Windows\\System32`
      const extent = `C:\\Program Files\\RedHat\\Podman;C:\\Windows\\System32\\WindowsPowerShell\\v1.0;${this.SystemPath || systemPath}`
      extent.split(';').forEach((path) => {
        const p = path.trim()
        if (p) {
          paths.unshift(p)
        }
      })

      /**
       * 需要过滤掉无效的PATH。避免执行命令时，无效PATH导致的路径问题
       */
      const path = Array.from(new Set(paths))
        .map((p) => p.trim())
        .filter((p) => {
          if (!p) {
            return false
          }
          // 保留标准的环境变量引用路径，Windows 子进程会自动展开
          // 如 %SystemRoot%\System32 或 $env:USERPROFILE\bin
          if (/%[^%]+%/.test(p) || p.includes('$env:')) {
            return true
          }
          // 过滤掉非绝对路径（如相对路径等）
          return isAbsolute(p)
        })
        .join(';')

      const env: any = { ...process.env, ...lastEnv, PATH: path, Path: path }
      if (global.Server.Proxy) {
        for (const k in global.Server.Proxy) {
          env[k] = global.Server.Proxy[k]
        }
      }
      this.AppEnv = env
      this.fetchWinPaths()
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

  clean() {
    this.AppEnv = undefined
    this.CMDPath = undefined
    this.PowerShellPath = undefined
  }
}

export default new EnvSync()
