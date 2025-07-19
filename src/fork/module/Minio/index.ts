import { basename, dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  serviceStartExec,
  spawnPromise,
  versionBinVersion,
  versionFilterSame,
  versionLocalFetch,
  versionSort,
  chmod,
  copyFile,
  mkdirp,
  readFile,
  writeFile,
  serviceStartExecWin
} from '../../Fn'
import TaskQueue from '../../TaskQueue'
import { I18nT } from '@lang/index'
import Helper from '../../Helper'
import { EOL } from 'os'
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
      if (isMacOS()) {
        const bin = join(global.Server.AppDir!, `minio`, 'minio')
        const zip = join(global.Server.Cache!, 'minio')
        const arch = global.Server.isArmArch ? 'arm64' : 'amd64'
        const all: any[] = [
          {
            url: `https://dl.min.io/server/minio/release/darwin-${arch}/minio`,
            appDir: join(global.Server.AppDir!, `minio`),
            bin,
            zip,
            downloaded: existsSync(zip),
            installed: existsSync(bin),
            version: 'lasted',
            name: `Minio-lasted`
          }
        ]
        resolve(all)
      } else if (isWindows()) {
        const bin = join(global.Server.AppDir!, `minio`, 'minio.exe')
        const zip = join(global.Server.Cache!, 'minio.exe')
        const all: any[] = [
          {
            url: 'https://dl.min.io/server/minio/release/windows-amd64/minio.exe',
            appDir: join(global.Server.AppDir!, `minio`),
            bin,
            zip,
            downloaded: existsSync(zip),
            installed: existsSync(bin),
            version: 'lasted',
            name: `Minio-lasted`
          }
        ]
        resolve(all)
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

      if (isMacOS()) {
        const envs: string[] = []
        for (const k in opt) {
          const v = opt[k]
          if (k === 'MINIO_ADDRESS') {
            address = v
          } else if (k === 'MINIO_CONSOLE_ADDRESS') {
            console_address = v
          } else if (k === 'MINIO_CERTS_DIR') {
            certs_dir = v
          }
          envs.push(`export ${k}="${v}"`)
        }
        envs.push('')

        const execEnv = envs.join(EOL)
        let execArgs = `server "${dataDir}"`
        if (address) {
          execArgs += ` --address "${address}"`
        }
        if (console_address) {
          execArgs += ` --console-address "${console_address}"`
        }
        if (certs_dir) {
          execArgs += ` --certs-dir "${certs_dir}"`
        }

        try {
          const res = await serviceStartExec({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs,
            execEnv,
            on,
            checkPidFile: false
          })
          resolve(res)
        } catch (e: any) {
          console.log('-k start err: ', e)
          reject(e)
          return
        }
      } else if (isWindows()) {
        const envs: string[] = []
        for (const k in opt) {
          const v = opt[k]
          if (k === 'MINIO_ADDRESS') {
            address = v
          } else if (k === 'MINIO_CONSOLE_ADDRESS') {
            console_address = v
          } else if (k === 'MINIO_CERTS_DIR') {
            certs_dir = v
          }
          envs.push(`export ${k}="${v}"`)
        }
        envs.push('')

        let execArgs = `server \`"${dataDir}\`"`
        const execEnv = envs.join('\n')
        if (address) {
          execArgs += ` --address "${address}"`
        }
        if (console_address) {
          execArgs += ` --console-address "${console_address}"`
        }
        if (certs_dir) {
          execArgs += ` --certs-dir "${certs_dir}"`
        }

        try {
          const res = await serviceStartExecWin({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs,
            execEnv,
            on,
            checkPidFile: false
          })
          resolve(res)
        } catch (e: any) {
          console.log('-k start err: ', e)
          reject(e)
          return
        }
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isMacOS()) {
        all = [versionLocalFetch(setup?.minio?.dirs ?? [], 'minio', 'minio')]
      } else if (isWindows()) {
        all = [versionLocalFetch(setup?.minio?.dirs ?? [], 'minio.exe')]
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
    if (isWindows()) {
      await mkdirp(dirname(row.bin))
      await copyFile(row.zip, row.bin)
    } else {
      await mkdirp(dirname(row.bin))
      await copyFile(row.zip, row.bin)
      await chmod(row.bin, '0777')
      try {
        await Helper.send('mailpit', 'binFixed', row.bin)
      } catch {}
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
}
export default new Minio()
