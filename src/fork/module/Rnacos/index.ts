import { join } from 'path'
import { existsSync, readdirSync } from 'fs'

import { Base } from '../Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  execPromiseWithEnv,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  readFile,
  writeFile,
  mkdirp,
  binXattrFix
} from '../../Fn'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '@lang/runtime'
import TaskQueue from '../../TaskQueue'
import { isMacOS, isWindows } from '@shared/utils'

class Rnacos extends Base {
  constructor() {
    super()
    this.type = 'rnacos'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'rnacos/rnacos.pid')
  }

  initConfig(): ForkPromise<string> {
    return new ForkPromise(async (resolve, _reject, on) => {
      const baseDir = join(global.Server.BaseDir!, 'rnacos')
      await mkdirp(baseDir)
      const envFile = join(baseDir, 'rnacos.env')
      if (!existsSync(envFile)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const isZh = global.Server.Lang === 'zh'
        const content = isZh
          ? `# R-Nacos 环境变量配置
# 参考文档: https://r-nacos.github.io/docs/env_config/

# === 端口配置 ===
# RNACOS_HTTP_PORT=8848
# RNACOS_GRPC_PORT=9848
# RNACOS_HTTP_CONSOLE_PORT=10848

# === 数据目录 (由 FlyEnv 自动管理) ===
# RNACOS_DATA_DIR=${join(baseDir, 'data')}

# === 控制台账号 ===
# RNACOS_INIT_ADMIN_USERNAME=admin
# RNACOS_INIT_ADMIN_PASSWORD=admin

# === 日志等级: debug, info, warn, error ===
# RUST_LOG=info
`
          : `# R-Nacos Environment Variables
# Reference: https://r-nacos.github.io/docs/env_config/

# === Port Configuration ===
# RNACOS_HTTP_PORT=8848
# RNACOS_GRPC_PORT=9848
# RNACOS_HTTP_CONSOLE_PORT=10848

# === Data Directory (Managed by FlyEnv) ===
# RNACOS_DATA_DIR=${join(baseDir, 'data')}

# === Console Account ===
# RNACOS_INIT_ADMIN_USERNAME=admin
# RNACOS_INIT_ADMIN_PASSWORD=admin

# === Log Level: debug, info, warn, error ===
# RUST_LOG=info
`
        await writeFile(envFile, content)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: envFile }))
        })
      }
      resolve(envFile)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `rnacos-${version.version}` })
        )
      })
      const bin = version.bin
      const baseDir = join(global.Server.BaseDir!, 'rnacos')
      await mkdirp(baseDir)

      const envFile = join(baseDir, 'rnacos.env')
      const execEnv: Record<string, string> = {}
      if (existsSync(envFile)) {
        const envContent = await readFile(envFile, 'utf-8')
        const envLines = envContent
          .split('\n')
          .map((s) => s.trim())
          .filter((s) => !!s && !s.startsWith('#'))
        envLines.forEach((line) => {
          const idx = line.indexOf('=')
          if (idx > 0) {
            const k = line.substring(0, idx)
            const v = line.substring(idx + 1)
            execEnv[k] = v
          }
        })
      }

      execEnv['RNACOS_DATA_DIR'] = join(baseDir, 'data')

      const execArgs = ['-e', envFile]
      try {
        const res = await serviceStartSpawn({
          version,
          pidPath: this.pidPath,
          baseDir,
          bin,
          execArgs,
          execEnv,
          waitTime: 1500,
          on
        })
        resolve(res)
      } catch (e: any) {
        console.log('rnacos start err: ', e)
        reject(e)
        return
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('r-nacos')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isWindows()) {
            dir = join(global.Server.AppDir!, 'rnacos', a.version, 'rnacos.exe')
            zip = join(global.Server.Cache!, `rnacos-${a.version}.zip`)
            a.appDir = join(global.Server.AppDir!, 'rnacos', a.version)
          } else {
            dir = join(global.Server.AppDir!, 'rnacos', a.version, 'rnacos')
            zip = join(global.Server.Cache!, `rnacos-${a.version}.tgz`)
            a.appDir = join(global.Server.AppDir!, 'rnacos', a.version)
          }

          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `R-Nacos-${a.version}`
        })
        resolve(all)
      } catch {
        resolve({})
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.rnacos?.dirs ?? [], 'rnacos.exe')]
      } else {
        all = [versionLocalFetch(setup?.rnacos?.dirs ?? [], 'rnacos', 'r-nacos')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(rnacos\s+v?)(\d+(\.\d+){1,4})/gi
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            const num = version
              ? Number(versionFixed(version).split('.').slice(0, 2).join(''))
              : null
            Object.assign(versions[i], {
              version: version,
              num,
              enable: version !== null,
              error
            })
          })
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    const baseDir = join(global.Server.BaseDir!, 'rnacos')
    const files: Array<{ name: string; path: string }> = []
    try {
      if (existsSync(baseDir)) {
        const list = readdirSync(baseDir)
        list.forEach((name) => {
          if (name.startsWith('rnacos-') && name.endsWith('.log')) {
            files.push({
              name: name.replace('.log', ''),
              path: join(baseDir, name)
            })
          }
        })
      }
    } catch (e) {
      console.log('rnacos getLogFiles error: ', e)
    }
    return files
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const allTap = await execPromiseWithEnv('brew tap')
        if (!allTap.stdout.includes('r-nacos/r-nacos')) {
          await execPromiseWithEnv('brew tap r-nacos/r-nacos')
        }
        const all = ['r-nacos']
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    await super._installSoftHandle(row)
    if (isMacOS()) {
      await binXattrFix(row.bin)
    }
  }

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    const baseDir = join(global.Server.BaseDir!, 'rnacos')
    return [
      {
        name: 'R-Nacos Env',
        path: join(baseDir, 'rnacos.env')
      }
    ]
  }
}

export default new Rnacos()
