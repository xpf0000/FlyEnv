import { existsSync } from 'fs'
import { dirname } from 'path'
import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { execPromiseWithEnv, mkdirp, remove, zipUnpack } from '../../Fn'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import EnvSync from '@shared/EnvSync'
import type { SoftInstalled } from '@shared/app'

type GitCheckItem = {
  label: string
  ok: boolean
  value: string
  message: string
}

class Git extends Base {
  constructor() {
    super()
    this.type = 'git'
  }

  async _installSoftHandle(row: any): Promise<void> {
    if (!isWindows()) {
      await super._installSoftHandle(row)
      return
    }
    await remove(row.appDir)
    await mkdirp(row.appDir)
    await zipUnpack(row.zip, row.appDir)
  }

  checkInstalled() {
    return new ForkPromise(async (resolve) => {
      EnvSync.clean()
      const item = await this.checkCommand('git', 'Git Version')
      resolve({
        installed: item.ok,
        version: item.message
      })
    })
  }

  check() {
    return new ForkPromise(async (resolve) => {
      const items: GitCheckItem[] = []
      const system = await this.checkCommand('git', 'Git Version')
      items.push(system)
      if (isWindows()) {
        items.push(await this.checkCommand('where.exe', 'Git Path', 'git'))
      } else {
        items.push(await this.checkCommand('which', 'Git Path', 'git'))
      }
      items.push(await this.checkCommand('ssh', 'SSH', '-V'))
      items.push(await this.checkCommand('git-lfs', 'Git LFS'))

      resolve({
        platform: isWindows()
          ? 'Windows'
          : isMacOS()
            ? 'macOS'
            : isLinux()
              ? 'Linux'
              : process.platform,
        arch: process.arch,
        installed: system.ok,
        items
      })
    })
  }

  private async checkCommand(
    command: string,
    label: string,
    versionArg = '--version'
  ): Promise<GitCheckItem> {
    const isPath = command.includes('/') || command.includes('\\')
    if (isPath && !existsSync(command)) {
      return {
        label,
        ok: false,
        value: command,
        message: 'Not found'
      }
    }
    try {
      const res = await execPromiseWithEnv(`"${command}" ${versionArg}`, {
        windowsHide: true,
        cwd: isPath ? dirname(command) : undefined
      })
      console.log('checkCommand: ', res)
      return {
        label,
        ok: true,
        value: `${command} ${versionArg}`,
        message: `${res.stdout || res.stderr || ''}`.trim()
      }
    } catch (e: any) {
      return {
        label,
        ok: false,
        value: `${command} ${versionArg}`,
        message: e?.message ?? 'Check failed'
      }
    }
  }

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    // Git 模块仅做命令可用性检查，不管理 Git 服务的配置文件
    return []
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    // Git 模块不管理日志文件
    return []
  }
}

export default new Git()
