import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  portSearch,
  serviceStartExec,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  writeFile,
  mkdirp,
  serviceStartExecCMD,
  versionBinVersionSync,
  chmod
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '@lang/index'
import TaskQueue from '../../TaskQueue'
import { isLinux, isWindows } from '@shared/utils'
import { address } from 'neoip'

class Consul extends Base {
  constructor() {
    super()
    this.type = 'consul'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'consul/consul.pid')
  }

  initConfig(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      const baseDir = join(global.Server.BaseDir!, 'consul')
      const versionTop = version.version?.split('.')?.shift() ?? ''
      const iniFile = join(baseDir, `consul-${versionTop}.json`)
      if (!existsSync(iniFile)) {
        if (!existsSync(baseDir)) {
          await mkdirp(baseDir)
          await chmod(baseDir, '0777')
        }
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const content = JSON.stringify(
          {
            server: true,
            bootstrap: true,
            client_addr: '127.0.0.1',
            ui: true
          },
          null,
          2
        )
        await writeFile(iniFile, content)
        const defaultIniFile = join(baseDir, `consul-${versionTop}.default`)
        await writeFile(defaultIniFile, content)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: iniFile }))
        })
      }
      resolve(iniFile)
    })
  }

  _startServer(version: SoftInstalled, DATA_DIR?: string) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `consul-${version.version}` })
        )
      })

      const iniFile = await this.initConfig(version).on(on)

      const bin = version.bin
      const baseDir = join(global.Server.BaseDir!, 'consul')
      if (!existsSync(baseDir)) {
        await mkdirp(baseDir)
        await chmod(baseDir, '0777')
      }

      const versionTop = version?.version?.split('.')?.shift() ?? ''
      const dbPath = DATA_DIR ?? join(baseDir, `consul-${versionTop}-data`)
      const logPath = join(baseDir, `consul.log`)
      const ip = address()
      if (isWindows()) {
        const execArgs = `agent -config-file="${iniFile}" -data-dir="${dbPath}" -log-file="${logPath}" -bind="${ip}" -pid-file="${this.pidPath}"`
        try {
          const res = await serviceStartExecCMD({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs,
            execEnv: '',
            on
          })
          resolve(res)
        } catch (e: any) {
          console.log('-k start err: ', e)
          reject(e)
          return
        }
      } else {
        const execEnv = ``
        const execArgs = `agent -config-file="${iniFile}" -data-dir="${dbPath}" -log-file="${logPath}" -bind="${ip}" -pid-file="${this.pidPath}"`
        try {
          const res = await serviceStartExec({
            root: isLinux(),
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
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('consul')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isWindows()) {
            dir = join(global.Server.AppDir!, `consul`, a.version, 'consul.exe')
            zip = join(global.Server.Cache!, `consul-${a.version}.zip`)
            a.appDir = join(global.Server.AppDir!, `consul`, a.version)
          } else {
            dir = join(global.Server.AppDir!, `consul`, a.version, 'consul')
            zip = join(global.Server.Cache!, `consul-${a.version}.zip`)
            a.appDir = join(global.Server.AppDir!, `consul`, a.version)
          }
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `Consul-${a.version}`
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
        all = [versionLocalFetch(setup?.consul?.dirs ?? [], 'consul.exe')]
      } else {
        all = [versionLocalFetch(setup?.consul?.dirs ?? [], 'consul', 'consul')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" version`
            const reg = /(v)(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then(async (list) => {
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

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const all = ['consul']
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }

  portinfo() {
    return new ForkPromise(async (resolve) => {
      const Info: { [k: string]: any } = await portSearch(
        `"^consul\\d*$"`,
        (f) => {
          return f.includes(
            'Consul is a distributed service mesh to connect, secure, and configure services across any runtime platform and public or private cloud'
          )
        },
        (name, version) => {
          const bin = join('/opt/local/bin/', name)
          let is = existsSync(bin)
          if (is) {
            const command = `"${bin}" version`
            const reg = /(v)(\d+(\.\d+){1,4})(.*?)/g
            const v = versionBinVersionSync(bin, command, reg)
            console.log('portinfo true v: ', v)
            is = v === version
          }
          return is
        }
      )
      resolve(Info)
    })
  }
}
export default new Consul()
