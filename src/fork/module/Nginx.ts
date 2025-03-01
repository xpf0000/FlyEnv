import { join, dirname, basename } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { AppHost, SoftInstalled } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp, remove } from 'fs-extra'
import {
  AppLog,
  brewInfoJson,
  execPromise,
  portSearch,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort
} from '../Fn'
import TaskQueue from '../TaskQueue'
import { fetchHostList } from './host/HostFile'
import { I18nT } from '../lang'

class Nginx extends Base {
  constructor() {
    super()
    this.type = 'nginx'
  }

  init() {
    this.pidPath = join(global.Server.NginxDir!, 'common/logs/nginx.pid')
  }

  async #handlePhpEnableConf() {
    let host: AppHost[] = []
    try {
      host = await fetchHostList()
    } catch (e) {}
    const all = new Set(host.map((h: any) => h.phpVersion).filter((h: number | undefined) => !!h))
    const tmplFile = join(global.Server.Static!, 'tmpl/enable-php.conf')
    let tmplContent = ''
    for (const v of all) {
      const name = `enable-php-${v}.conf`
      const confFile = join(global.Server.NginxDir!, 'common/conf/', name)
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

  async _fixConf() {
    return new ForkPromise(async (resolve) => {
      const c = join(global.Server.NginxDir!, 'common/conf/nginx.conf')
      if (!existsSync(c)) {
        return resolve(true)
      }
      let content = await readFile(c, 'utf-8')
      const add: string[] = [
        'client_body_temp',
        'proxy_temp',
        'fastcgi_temp',
        'uwsgi_temp',
        'scgi_temp'
      ]
        .filter((s) => {
          const regex = new RegExp(`^[\\s\\n]?((?!#)([\\s]*?))${s}_path\\s+(.*?);`, 'gm')
          return !regex.test(content)
        })
        .map((s) => `    ${s}_path run/${s};`)

      if (add.length === 0) {
        return resolve(true)
      }

      content = content.replace(/http(.*?)\{(.*?)\n/g, `http {\n${add.join('\n')}\n`)
      await writeFile(c, content)
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
      await this.#handlePhpEnableConf()
      console.log('_startServer: ', version)
      const bin = version.bin
      const c = join(global.Server.NginxDir!, 'common/conf/nginx.conf')
      const pid = join(global.Server.NginxDir!, 'common/logs/nginx.pid')
      const errlog = join(global.Server.NginxDir!, 'common/logs/error.log')
      const temp_path = join(global.Server.NginxDir!, 'common/run')
      await mkdirp(temp_path)
      await this._fixConf()
      const g = `pid ${pid};error_log ${errlog};`
      const p = join(global.Server.NginxDir!, 'common')
      if (existsSync(pid)) {
        try {
          await remove(pid)
        } catch (e) {}
      }
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
      })
      const command = `cd "${dirname(bin)}" && ./${basename(bin)} -p "${p}" -e "${errlog}" -c ${c} -g "${g}"`
      console.log('command: ', command)

      try {
        await execPromise(command)
      } catch (e) {
        on({
          'APP-On-Log': AppLog(
            'error',
            I18nT('appLog.execStartCommandFail', {
              error: e,
              service: `${this.type}-${version.version}`
            })
          )
        })
        console.log('start e: ', e)
        reject(e)
        return
      }
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommandSuccess'))
      })
      on({
        'APP-Service-Start-Success': true
      })
      const res = await this.waitPidFile(pid)
      if (res && res?.pid) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: res.pid }))
        })
        resolve({
          'APP-Service-Start-PID': res.pid
        })
        return
      }
      const error = res ? res?.error : I18nT('fork.startFail')
      on({
        'APP-On-Log': AppLog(
          'error',
          I18nT('appLog.execStartCommandFail', {
            error,
            service: `${this.type}-${version.version}`
          })
        )
      })
      reject(new Error(error))
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.nginx?.dirs ?? [], 'nginx', 'nginx')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `${item.bin} -v`
            const reg = /(\/)(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, command, reg)
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

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const all: Array<string> = ['nginx']
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
        `^nginx\\d*$`,
        (f) => {
          return f.includes('High-performance HTTP(S) server')
        },
        (name) => {
          return existsSync(join('/opt/local/sbin/', name))
        }
      )
      resolve(Info)
    })
  }
}
export default new Nginx()
