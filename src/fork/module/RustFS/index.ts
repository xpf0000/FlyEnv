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
  mkdirp,
  readFile,
  writeFile,
  binXattrFix
} from '../../Fn'
import TaskQueue from '../../TaskQueue'
import { I18nT } from '@lang/index'
import { isMacOS, isWindows } from '@shared/utils'
import { serviceStartSpawn } from '../../util/ServiceStart'

class RustFS extends Base {
  constructor() {
    super()
    this.type = 'rustfs'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'rustfs/rustfs.pid')
  }

  initConfig(): ForkPromise<string> {
    return new ForkPromise(async (resolve) => {
      const baseDir = join(global.Server.BaseDir!, 'rustfs')
      if (!existsSync(baseDir)) {
        await mkdirp(baseDir)
      }
      const iniFile = join(baseDir, 'rustfs.conf')
      if (!existsSync(iniFile)) {
        await writeFile(iniFile, '')
      }
      resolve(iniFile)
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('rustfs')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isWindows()) {
            dir = join(global.Server.AppDir!, `rustfs`, a.version, 'rustfs.exe')
            zip = join(global.Server.Cache!, `rustfs-${a.version}.zip`)
          } else {
            dir = join(global.Server.AppDir!, `rustfs`, a.version, 'rustfs')
            zip = join(global.Server.Cache!, `rustfs-${a.version}.zip`)
          }
          a.appDir = join(global.Server.AppDir!, 'rustfs', a.version)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `RustFS-${a.version}`
        })
        resolve(all)
      } catch {
        resolve({})
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
      const baseDir = join(global.Server.BaseDir!, 'rustfs')
      await mkdirp(baseDir)
      const dataDir = DATA_DIR ?? join(baseDir, 'data')
      await mkdirp(dataDir)

      const getConfEnv = async () => {
        const content = await readFile(iniFile, 'utf-8')
        const arr = content
          .split('\n')
          .filter((s) => {
            const str = s.trim()
            return !!str && str.startsWith('RUSTFS_')
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

      const env = await getConfEnv()

      // Build command line args from config
      const volumes = dataDir
      const execArgs: string[] = ['server']

      if (env['RUSTFS_ADDRESS']) {
        execArgs.push('--address')
        execArgs.push(env['RUSTFS_ADDRESS'])
      }
      if (env['RUSTFS_SERVER_DOMAINS']) {
        execArgs.push('--server-domains')
        execArgs.push(env['RUSTFS_SERVER_DOMAINS'])
      }
      if (env['RUSTFS_ACCESS_KEY']) {
        execArgs.push('--access-key')
        execArgs.push(env['RUSTFS_ACCESS_KEY'])
      }
      if (env['RUSTFS_ACCESS_KEY_FILE']) {
        execArgs.push('--access-key-file')
        execArgs.push(env['RUSTFS_ACCESS_KEY_FILE'])
      }
      if (env['RUSTFS_SECRET_KEY']) {
        execArgs.push('--secret-key')
        execArgs.push(env['RUSTFS_SECRET_KEY'])
      }
      if (env['RUSTFS_SECRET_KEY_FILE']) {
        execArgs.push('--secret-key-file')
        execArgs.push(env['RUSTFS_SECRET_KEY_FILE'])
      }
      if (env['RUSTFS_CONSOLE_ENABLE'] === 'true' || env['RUSTFS_CONSOLE_ENABLE'] === 'on') {
        execArgs.push('--console-enable')
      }
      if (env['RUSTFS_CONSOLE_ADDRESS']) {
        execArgs.push('--console-address')
        execArgs.push(env['RUSTFS_CONSOLE_ADDRESS'])
      }
      if (env['RUSTFS_OBS_ENDPOINT']) {
        execArgs.push('--obs-endpoint')
        execArgs.push(env['RUSTFS_OBS_ENDPOINT'])
      }
      if (env['RUSTFS_TLS_PATH']) {
        execArgs.push('--tls-path')
        execArgs.push(env['RUSTFS_TLS_PATH'])
      }
      if (env['RUSTFS_LICENSE']) {
        execArgs.push('--license')
        execArgs.push(env['RUSTFS_LICENSE'])
      }
      if (env['RUSTFS_REGION']) {
        execArgs.push('--region')
        execArgs.push(env['RUSTFS_REGION'])
      }
      if (env['RUSTFS_KMS_ENABLE'] === 'true' || env['RUSTFS_KMS_ENABLE'] === 'on') {
        execArgs.push('--kms-enable')
      }
      if (env['RUSTFS_KMS_BACKEND']) {
        execArgs.push('--kms-backend')
        execArgs.push(env['RUSTFS_KMS_BACKEND'])
      }
      if (env['RUSTFS_KMS_KEY_DIR']) {
        execArgs.push('--kms-key-dir')
        execArgs.push(env['RUSTFS_KMS_KEY_DIR'])
      }
      if (env['RUSTFS_KMS_VAULT_ADDRESS']) {
        execArgs.push('--kms-vault-address')
        execArgs.push(env['RUSTFS_KMS_VAULT_ADDRESS'])
      }
      if (env['RUSTFS_KMS_VAULT_TOKEN']) {
        execArgs.push('--kms-vault-token')
        execArgs.push(env['RUSTFS_KMS_VAULT_TOKEN'])
      }
      if (env['RUSTFS_KMS_DEFAULT_KEY_ID']) {
        execArgs.push('--kms-default-key-id')
        execArgs.push(env['RUSTFS_KMS_DEFAULT_KEY_ID'])
      }
      if (
        env['RUSTFS_BUFFER_PROFILE_DISABLE'] === 'true' ||
        env['RUSTFS_BUFFER_PROFILE_DISABLE'] === 'on'
      ) {
        execArgs.push('--buffer-profile-disable')
      }
      if (env['RUSTFS_BUFFER_PROFILE']) {
        execArgs.push('--buffer-profile')
        execArgs.push(env['RUSTFS_BUFFER_PROFILE'])
      }

      execArgs.push(volumes)

      try {
        const res = await serviceStartSpawn({
          version,
          pidPath: this.pidPath,
          baseDir,
          bin,
          execArgs,
          execEnv: env,
          on
        })
        resolve(res)
      } catch (e) {
        reject(e)
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.rustfs?.dirs ?? [], 'rustfs.exe')]
      } else {
        all = [versionLocalFetch(setup?.rustfs?.dirs ?? [], 'rustfs', 'rustfs')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(rustfs )(.*?)(\n)/g
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
    if (isMacOS()) {
      try {
        await binXattrFix(row.bin)
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
        const all = ['rustfs']
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }
}
export default new RustFS()
