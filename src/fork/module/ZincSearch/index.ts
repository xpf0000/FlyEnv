import { basename, dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  binXattrFix,
  chmod,
  mkdirp,
  moveChildDirToParent,
  readFile,
  remove,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  writeFile
} from '../../Fn'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '@lang/runtime'
import TaskQueue from '../../TaskQueue'
import { isMacOS, isWindows } from '@shared/utils'

const envValue = (value: string) => {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

class ZincSearch extends Base {
  constructor() {
    super()
    this.type = 'zincsearch'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'zincsearch/zincsearch.pid')
  }

  initConfig(): ForkPromise<string> {
    return new ForkPromise(async (resolve, _reject, on) => {
      const baseDir = join(global.Server.BaseDir!, 'zincsearch')
      await mkdirp(baseDir)
      const envFile = join(baseDir, 'zincsearch.env')
      if (!existsSync(envFile)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const dataDir = join(baseDir, 'data')
        const content = `# ZincSearch Environment Variables
# Reference: https://zincsearch-docs.zinc.dev/quickstart/

ZINC_FIRST_ADMIN_USER=admin
ZINC_FIRST_ADMIN_PASSWORD=admin
ZINC_DATA_PATH=${dataDir}
ZINC_SERVER_ADDRESS=127.0.0.1
ZINC_SERVER_PORT=4080
ZINC_LOG_LEVEL=info
`
        await writeFile(envFile, content)
        const defaultEnvFile = join(baseDir, 'zincsearch.env.default')
        await writeFile(defaultEnvFile, content)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: envFile }))
        })
      }
      resolve(envFile)
    })
  }

  async readEnvFile(envFile: string) {
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
          const k = line.substring(0, idx).trim()
          const v = envValue(line.substring(idx + 1))
          execEnv[k] = v
        }
      })
    }
    return execEnv
  }

  async initVersionEnvFile(bin: string) {
    const baseDir = dirname(bin)
    const envFile = join(baseDir, '.env')
    if (existsSync(envFile)) {
      return
    }
    const dataDir = join(baseDir, 'data')
    await mkdirp(dataDir)
    const content = `ZINC_FIRST_ADMIN_USER=admin
ZINC_FIRST_ADMIN_PASSWORD=admin
ZINC_DATA_PATH=${dataDir}
ZINC_SERVER_ADDRESS=127.0.0.1
ZINC_SERVER_PORT=4080
ZINC_LOG_LEVEL=info
`
    await writeFile(envFile, content)
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `zincsearch-${version.version}` })
        )
      })
      const bin = version.bin
      const baseDir = join(global.Server.BaseDir!, 'zincsearch')
      await mkdirp(baseDir)

      const envFile = await this.initConfig().on(on)
      const execEnv = await this.readEnvFile(envFile)
      execEnv.ZINC_FIRST_ADMIN_USER = execEnv.ZINC_FIRST_ADMIN_USER || 'admin'
      execEnv.ZINC_FIRST_ADMIN_PASSWORD = execEnv.ZINC_FIRST_ADMIN_PASSWORD || 'admin'
      execEnv.ZINC_DATA_PATH = execEnv.ZINC_DATA_PATH || join(baseDir, 'data')
      execEnv.ZINC_SERVER_PORT = execEnv.ZINC_SERVER_PORT || '4080'
      await mkdirp(execEnv.ZINC_DATA_PATH)

      try {
        const res = await serviceStartSpawn({
          version,
          pidPath: this.pidPath,
          baseDir,
          bin,
          execEnv,
          waitTime: 2000,
          on
        })
        resolve(res)
      } catch (e: any) {
        console.log('zincsearch start err: ', e)
        reject(e)
        return
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('zincsearch')
        all.forEach((a: any) => {
          const appDir = join(global.Server.AppDir!, 'zincsearch', a.version)
          const bin = join(appDir, isWindows() ? 'zincsearch.exe' : 'zincsearch')
          const zipName = basename(new URL(a.url).pathname)
          const zip = join(global.Server.Cache!, zipName)
          a.appDir = appDir
          a.zip = zip
          a.bin = bin
          a.downloaded = existsSync(zip)
          a.installed = existsSync(bin)
          a.name = `ZincSearch-${a.version}`
        })
        resolve(all)
      } catch (e) {
        console.log('zincsearch fetchAllOnlineVersion error: ', e)
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.zincsearch?.dirs ?? [], 'zincsearch.exe')]
      } else {
        all = [versionLocalFetch(setup?.zincsearch?.dirs ?? [], 'zincsearch', 'zincsearch')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map(async (item) => {
            try {
              await this.initVersionEnvFile(item.bin)
            } catch (e) {
              return {
                version: undefined,
                error: `${e}`
              }
            }
            const command = `"${item.bin}" version`
            const reg = /(zinc version v?)(\d+(\.\d+){1,4})(.*?)/gi
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            const finalVersion = version || null
            const num = finalVersion
              ? Number(versionFixed(finalVersion).split('.').slice(0, 2).join(''))
              : null
            Object.assign(versions[i], {
              version: finalVersion,
              num,
              enable: !!finalVersion,
              error: finalVersion ? undefined : error
            })
          })
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    await remove(row.appDir)
    await mkdirp(row.appDir)
    await super._installSoftHandle(row)
    await moveChildDirToParent(row.appDir)
    if (!isWindows() && existsSync(row.bin)) {
      await chmod(row.bin, '0755')
    }
    if (isMacOS() && existsSync(row.bin)) {
      await binXattrFix(row.bin)
    }
  }

  brewinfo() {
    return new ForkPromise(async (resolve) => {
      resolve({})
    })
  }

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    const baseDir = join(global.Server.BaseDir!, 'zincsearch')
    return [
      { name: 'zincsearch.env', path: join(baseDir, 'zincsearch.env') },
      { name: 'zincsearch.env.default', path: join(baseDir, 'zincsearch.env.default') }
    ]
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!_version?.version) {
      return []
    }
    const baseDir = join(global.Server.BaseDir!, 'zincsearch')
    const versionStr = _version.version.trim()
    return [
      {
        name: 'start-out',
        path: join(baseDir, `zincsearch-${versionStr}-start-out.log`.split(' ').join(''))
      },
      {
        name: 'start-error',
        path: join(baseDir, `zincsearch-${versionStr}-start-error.log`.split(' ').join(''))
      }
    ]
  }
}
export default new ZincSearch()
