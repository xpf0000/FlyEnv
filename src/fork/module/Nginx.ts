import { join, dirname, basename } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { AppHost, OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  serviceStartExecCMD,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionInitedApp,
  versionLocalFetch,
  versionSort,
  readFile,
  writeFile,
  mkdirp,
  zipUnPack
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../TaskQueue'
import { fetchHostList } from './host/HostFile'
import { I18nT } from '@lang/index'

class Nginx extends Base {
  constructor() {
    super()
    this.type = 'nginx'
  }

  init() {
    this.pidPath = join(window.Server.NginxDir!, 'nginx.pid')
  }

  async #handlePhpEnableConf() {
    let host: AppHost[] = []
    try {
      host = await fetchHostList()
    } catch {}
    const all = new Set(host.map((h: any) => h.phpVersion).filter((h: number | undefined) => !!h))
    const tmplFile = join(window.Server.Static!, 'tmpl/enable-php.conf')
    let tmplContent = ''
    for (const v of all) {
      const name = `enable-php-${v}.conf`
      const confFile = join(window.Server.NginxDir!, 'conf', name)
      if (!existsSync(confFile)) {
        await mkdirp(dirname(confFile))
        if (!tmplContent) {
          tmplContent = await readFile(tmplFile, 'utf-8')
        }
        const content = tmplContent.replace('##VERSION##', `${v}`)
        await writeFile(confFile, content)
      }
    }
  }

  #initConfig() {
    return new ForkPromise((resolve, reject, on) => {
      const conf = join(window.Server.NginxDir!, 'conf/nginx.conf')
      if (!existsSync(conf)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        zipUnPack(join(window.Server.Static!, 'zip/nginx.zip'), window.Server.NginxDir!)
          .then(() => {
            return readFile(conf, 'utf-8')
          })
          .then((content: string) => {
            content = content
              .replace(/#PREFIX#/g, window.Server.NginxDir!.split('\\').join('/'))
              .replace(
                '#VHostPath#',
                join(window.Server.BaseDir!, 'vhost/nginx').split('\\').join('/')
              )
            const defaultConf = join(window.Server.NginxDir!, 'conf/nginx.conf.default')
            return Promise.all([writeFile(conf, content), writeFile(defaultConf, content)])
          })
          .then(() => {
            on({
              'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: conf }))
            })
            resolve(true)
          })
          .catch((err: any) => {
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.confInitFail', { error: err }))
            })
            console.log('initConfig err: ', err)
            resolve(true)
          })
        return
      }
      resolve(true)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `nginx-${version.version}` })
        )
      })
      await this.initLocalApp(version, 'nginx').on(on)
      await this.#initConfig().on(on)
      await this.#handlePhpEnableConf()
      console.log('_startServer: ', version)
      const bin = version.bin
      const p = window.Server.NginxDir!

      const pid = join(window.Server.NginxDir!, 'logs/nginx.pid')

      const execArgs = `-p "${p}"`

      try {
        const res = await serviceStartExecCMD(
          version,
          pid,
          window.Server.NginxDir!,
          bin,
          execArgs,
          '',
          on
        )
        resolve(res)
      } catch (e: any) {
        console.log('-k start err: ', e)
        reject(e)
        return
      }
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('nginx')
        all.forEach((a: any) => {
          const dir = join(
            window.Server.AppDir!,
            `nginx-${a.version}`,
            `nginx-${a.version}`,
            'nginx.exe'
          )
          const zip = join(window.Server.Cache!, `nginx-${a.version}.zip`)
          a.appDir = join(window.Server.AppDir!, `nginx-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
        })
        resolve(all)
      } catch {
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.nginx?.dirs ?? [], 'nginx.exe')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `${basename(item.bin)} -v`
            const reg = /(\/)(\d+(\.\d+){1,4})(.*?)/g
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
          const appInited = await versionInitedApp('nginx', 'nginx.exe')
          versions.push(...appInited.filter((a) => !versions.find((v) => v.bin === a.bin)))
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }
}
export default new Nginx()
