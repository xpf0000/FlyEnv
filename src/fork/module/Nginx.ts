import { join, dirname, basename } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  execPromiseRoot,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionInitedApp,
  versionLocalFetch,
  versionSort
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp } from 'fs-extra'
import { zipUnPack } from '@shared/file'
import TaskQueue from '../TaskQueue'
import { EOL } from 'os'

class Nginx extends Base {
  constructor() {
    super()
    this.type = 'nginx'
  }

  init() {
    this.pidPath = join(global.Server.NginxDir!, 'nginx.pid')
  }

  async #handlePhpEnableConf() {
    const hostfile = join(global.Server.BaseDir!, 'host.json')
    let host = []
    if (existsSync(hostfile)) {
      try {
        const content = await readFile(hostfile, 'utf-8')
        host = JSON.parse(content)
      } catch (e) {}
    }
    const all = new Set(host.map((h: any) => h.phpVersion).filter((h: number | undefined) => !!h))
    const tmplFile = join(global.Server.Static!, 'tmpl/enable-php.conf')
    let tmplContent = ''
    for (const v of all) {
      const name = `enable-php-${v}.conf`
      const confFile = join(global.Server.NginxDir!, 'conf', name)
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
    return new Promise((resolve) => {
      const conf = join(global.Server.NginxDir!, 'conf/nginx.conf')
      if (!existsSync(conf)) {
        zipUnPack(join(global.Server.Static!, 'zip/nginx.zip'), global.Server.NginxDir!)
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
          .then(resolve)
          .catch((err: any) => {
            console.log('initConfig err: ', err)
            resolve(true)
          })
        return
      }
      resolve(true)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
      await this.initLocalApp(version, 'nginx')
      await this.#initConfig()
      await this.#handlePhpEnableConf()
      console.log('_startServer: ', version)
      const bin = version.bin
      const p = global.Server.NginxDir!

      const pid = join(global.Server.NginxDir!, 'logs/nginx.pid')
      if (existsSync(pid)) {
        try {
          await execPromiseRoot(`del -Force "${pid}"`)
        } catch (e) {}
      }

      const startLogFile = join(global.Server.NginxDir!, `start.log`)
      const startErrLogFile = join(global.Server.NginxDir!, `start.error.log`)
      if (existsSync(startErrLogFile)) {
        try {
          await execPromiseRoot(`del -Force "${startErrLogFile}"`)
        } catch (e) {}
      }

      const commands: string[] = [
        '@echo off',
        'chcp 65001>nul',
        `cd /d "${dirname(bin)}"`,
        `start /B ./${basename(bin)} -p "${p}" > "${startLogFile}" 2>"${startErrLogFile}"`
      ]

      const command = commands.join(EOL)
      console.log('command: ', command)

      const cmdName = `start.cmd`
      const sh = join(global.Server.NginxDir!, cmdName)
      await writeFile(sh, command)

      const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
      await mkdirp(dirname(appPidFile))
      if (existsSync(appPidFile)) {
        try {
          await execPromiseRoot(`del -Force "${appPidFile}"`)
        } catch (e) {}
      }

      process.chdir(global.Server.NginxDir!)
      try {
        await execPromiseRoot(
          `powershell.exe -Command "(Start-Process -FilePath ./${cmdName} -PassThru -WindowStyle Hidden).Id"`
        )
      } catch (e: any) {
        console.log('-k start err: ', e)
        reject(e)
        return
      }
      const res = await this.waitPidFile(pid)
      if (res) {
        if (res?.pid) {
          await writeFile(appPidFile, res.pid)
          resolve({
            'APP-Service-Start-PID': res.pid
          })
          return
        }
        reject(new Error(res?.error ?? 'Start Fail'))
        return
      }
      let msg = 'Start Fail'
      if (existsSync(startLogFile)) {
        msg = await readFile(startLogFile, 'utf-8')
      }
      reject(new Error(msg))
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('nginx')
        all.forEach((a: any) => {
          const dir = join(
            global.Server.AppDir!,
            `nginx-${a.version}`,
            `nginx-${a.version}`,
            'nginx.exe'
          )
          const zip = join(global.Server.Cache!, `nginx-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `nginx-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
        })
        resolve(all)
      } catch (e) {
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
