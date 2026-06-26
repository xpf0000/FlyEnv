import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  portSearch,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  writeFile,
  mkdirp,
  versionBinVersionSync,
  chmod
} from '../../Fn'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '@lang/index'
import TaskQueue from '../../TaskQueue'
import { isWindows } from '@shared/utils'
import { getPrimaryLocalIPAddress } from '@shared/network'

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
        const json: any = {
          server: true,
          bootstrap_expect: 1,
          client_addr: '127.0.0.1',
          ui_config: {
            enabled: true
          }
        }
        if (isWindows()) {
          // Consul's default Raft WAL backend fsyncs the `raft/wal` directory on start,
          // which Windows rejects with "Access is denied". Use the BoltDB backend instead.
          json.raft_logstore = { backend: 'boltdb' }
        }
        const content = JSON.stringify(json, null, 2)
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
      const ip = getPrimaryLocalIPAddress()
      // Consul binds only non-privileged ports (8500/8600/8300...), so no root is
      // needed on any platform — single detached-spawn path, no script landed.
      const execArgs = [
        'agent',
        `-config-file=${iniFile}`,
        `-data-dir=${dbPath}`,
        `-log-file=${logPath}`,
        `-bind=${ip}`,
        `-pid-file=${this.pidPath}`
      ]
      try {
        const res = await serviceStartSpawn({
          version,
          pidPath: this.pidPath,
          baseDir,
          bin,
          execArgs,
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

  getConfigFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    const v = version?.version?.split('.')?.shift() ?? ''
    if (!v) return []
    const baseDir = join(global.Server.BaseDir!, 'consul')
    return [
      { name: 'config', path: join(baseDir, `consul-${v}.json`) },
      { name: 'default', path: join(baseDir, `consul-${v}.default`) }
    ]
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    const baseDir = join(global.Server.BaseDir!, 'consul')
    return [{ name: 'log', path: join(baseDir, 'consul.log') }]
  }
}
export default new Consul()
