import { basename, dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  spawnPromise,
  versionBinVersion,
  versionFilterSame,
  versionLocalFetch,
  versionSort,
  chmod,
  mkdirp,
  readFile,
  writeFile,
  binXattrFix
} from '../../Fn'
import { serviceStartSpawn } from '../../util/ServiceStart'
import TaskQueue from '../../TaskQueue'
import { I18nT } from '@lang/index'
import { isMacOS, isWindows } from '@shared/utils'

class Minio extends Base {
  constructor() {
    super()
    this.type = 'minio'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'minio/minio.pid')
  }

  initConfig(): ForkPromise<string> {
    return new ForkPromise(async (resolve) => {
      const baseDir = join(global.Server.BaseDir!, 'minio')
      if (!existsSync(baseDir)) {
        await mkdirp(baseDir)
      }
      const iniFile = join(baseDir, 'minio.conf')
      if (!existsSync(iniFile)) {
        await writeFile(iniFile, '')
      }
      resolve(iniFile)
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('minio')
        all.forEach((a: any) => {
          let bin = ''
          let zip = ''
          if (isWindows()) {
            bin = join(global.Server.AppDir!, `minio-${a.version}`, 'minio.exe')
            zip = join(global.Server.Cache!, `minio-${a.version}.tar.gz`)
          } else {
            bin = join(global.Server.AppDir!, `minio-${a.version}`, 'minio')
            zip = join(global.Server.Cache!, `minio-${a.version}.tar.gz`)
          }
          a.appDir = join(global.Server.AppDir!, `minio-${a.version}`)
          a.zip = zip
          a.bin = bin
          a.downloaded = existsSync(zip)
          a.installed = existsSync(bin)
          a.name = `Minio-${a.version}`
        })
        resolve(all)
      } catch {
        resolve([])
      }
    })
  }

  _startServer(version: SoftInstalled, DATA_DIR?: string) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })

      const iniFile = await this.initConfig().on(on)

      const bin = version.bin
      const baseDir = join(global.Server.BaseDir!, 'minio')
      const dataDir = DATA_DIR ?? join(baseDir, 'data')
      await mkdirp(dataDir)

      let address = ''
      let console_address = ''
      let certs_dir = ''

      const getConfEnv = async () => {
        const content = await readFile(iniFile, 'utf-8')
        const arr = content
          .split('\n')
          .filter((s) => {
            const str = s.trim()
            return !!str && str.startsWith('MINIO_')
          })
          .map((s) => s.trim())
        const dict: Record<string, string> = {}
        arr.forEach((a) => {
          const item = a.split('=')
          const k = item.shift()
          const v = item.join('=')
          if (k) {
            dict[k] = v
          }
        })
        return dict
      }

      const opt = await getConfEnv()

      const execEnv: Record<string, string> = {}
      for (const k in opt) {
        const v = opt[k]
        if (k === 'MINIO_ADDRESS') {
          address = v
        } else if (k === 'MINIO_CONSOLE_ADDRESS') {
          console_address = v
        } else if (k === 'MINIO_CERTS_DIR') {
          certs_dir = v
        }
        execEnv[k] = v
      }

      const execArgs = ['server', dataDir]
      if (address) {
        execArgs.push('--address', address)
      }
      if (console_address) {
        execArgs.push('--console-address', console_address)
      }
      if (certs_dir) {
        execArgs.push('--certs-dir', certs_dir)
      }

      try {
        const res = await serviceStartSpawn({
          version,
          pidPath: this.pidPath,
          baseDir,
          bin,
          execArgs,
          execEnv,
          on
        })
        resolve(res)
      } catch (e: any) {
        console.log('-k start err: ', e)
        reject(e)
        return
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.minio?.dirs ?? [], 'minio.exe')]
      } else {
        all = [versionLocalFetch(setup?.minio?.dirs ?? [], 'minio', 'minio')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(version )(.*?)( )/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            Object.assign(versions[i], {
              version: version,
              num: 0,
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

  async _installSoftHandle(row: any): Promise<void> {
    await super._installSoftHandle(row)
    if (!isWindows()) {
      await chmod(row.bin, '0755')
      if (isMacOS()) {
        try {
          await binXattrFix(row.bin)
        } catch {}
      }
    }

    await spawnPromise(basename(row.bin), ['--version'], {
      shell: false,
      cwd: dirname(row.bin)
    })
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const all = ['minio']
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    const baseDir = join(global.Server.BaseDir!, 'minio')
    return [{ name: 'minio.conf', path: join(baseDir, 'minio.conf') }]
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!_version?.version) {
      return []
    }
    const baseDir = join(global.Server.BaseDir!, 'minio')
    const versionStr = _version.version.trim()
    return [
      {
        name: 'start-out',
        path: join(baseDir, `minio-${versionStr}-start-out.log`.split(' ').join(''))
      },
      {
        name: 'start-error',
        path: join(baseDir, `minio-${versionStr}-start-error.log`.split(' ').join(''))
      }
    ]
  }
}
export default new Minio()
