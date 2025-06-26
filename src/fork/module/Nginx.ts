import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { AppHost, OnlineVersionItem, SoftInstalled } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'
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
  readFile,
  writeFile,
  mkdirp,
  zipUnpack,
  serviceStartExecCMD,
  readdir,
  execPromise,
  waitTime,
  remove
} from '../Fn'
import TaskQueue from '../TaskQueue'
import { fetchHostList } from './host/HostFile'
import { I18nT } from '@lang/index'
import { isMacOS, isWindows } from '@shared/utils'

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
    } catch {}
    const all = new Set(host.map((h: any) => h.phpVersion).filter((h: number | undefined) => !!h))
    const tmplFile = join(global.Server.Static!, 'tmpl/enable-php.conf')
    let tmplContent = ''
    for (const v of all) {
      const name = `enable-php-${v}.conf`
      let confFile = ''
      if (isMacOS()) {
        confFile = join(global.Server.NginxDir!, 'common/conf/', name)
      } else if (isWindows()) {
        confFile = join(global.Server.NginxDir!, 'conf', name)
      }
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

  #initConfig() {
    return new ForkPromise((resolve, reject, on) => {
      const conf = join(global.Server.NginxDir!, 'conf/nginx.conf')
      if (!existsSync(conf)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        zipUnpack(join(global.Server.Static!, 'zip/nginx.zip'), global.Server.NginxDir!)
          .then(() => {
            return readFile(conf, 'utf-8')
          })
          .then((content: string) => {
            content = content
              .replace(/#PREFIX#/g, global.Server.NginxDir!.split('\\').join('/'))
              .replace(
                '#VHostPath#',
                join(global.Server.BaseDir!, 'vhost/nginx').split('\\').join('/')
              )
            const defaultConf = join(global.Server.NginxDir!, 'conf/nginx.conf.default')
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
      if (isWindows()) {
        await this.#initConfig().on(on)
      }
      await this.#handlePhpEnableConf()
      console.log('_startServer: ', version)
      const bin = version.bin
      const baseDir = global.Server.NginxDir!
      const execEnv = ''

      if (isMacOS()) {
        const c = join(global.Server.NginxDir!, 'common/conf/nginx.conf')
        const pid = join(global.Server.NginxDir!, 'common/logs/nginx.pid')
        const errlog = join(global.Server.NginxDir!, 'common/logs/error.log')
        const temp_path = join(global.Server.NginxDir!, 'common/run')
        await mkdirp(temp_path)
        await this._fixConf()
        const g = `pid ${pid};error_log ${errlog};`
        const p = join(global.Server.NginxDir!, 'common')
        const execArgs = `-p "${p}" -e "${errlog}" -c ${c} -g "${g}"`

        try {
          const res = await serviceStartExec({
            version,
            pidPath: pid,
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
      } else if (isWindows()) {
        const bin = version.bin
        const p = global.Server.NginxDir!

        const pid = join(global.Server.NginxDir!, 'logs/nginx.pid')

        const execArgs = `-p "${p}"`

        try {
          const res = await serviceStartExecCMD({
            version,
            pidPath: pid,
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
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('nginx')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isMacOS()) {
            dir = join(global.Server.AppDir!, `nginx-${a.version}`, 'sbin/nginx')
            zip = join(global.Server.Cache!, `static-nginx-${a.version}.tar.xz`)
            a.appDir = join(global.Server.AppDir!, `nginx-${a.version}`)
          } else if (isWindows()) {
            dir = join(
              global.Server.AppDir!,
              `nginx-${a.version}`,
              `nginx-${a.version}`,
              'nginx.exe'
            )
            zip = join(global.Server.Cache!, `nginx-${a.version}.zip`)
            a.appDir = join(global.Server.AppDir!, `nginx-${a.version}`)
          }
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `Nginx-${a.version}`
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
      if (isMacOS()) {
        all = [versionLocalFetch(setup?.nginx?.dirs ?? [], 'nginx', 'nginx')]
      } else if (isWindows()) {
        all = [versionLocalFetch(setup?.nginx?.dirs ?? [], 'nginx.exe')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" -v`
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
      const dir = row.appDir
      const subDirs = await readdir(dir)
      const subDir = subDirs.pop()
      if (subDir) {
        await execPromise(`cd ${join(dir, subDir)} && mv ./* ../`)
        await waitTime(300)
        await remove(join(dir, subDir))
      }
    }
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
