import { join, dirname, basename } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { AppHost, OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  spawnPromise,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionInitedApp,
  versionLocalFetch,
  versionSort
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp, remove } from 'fs-extra'
import { zipUnPack } from '@shared/file'
import TaskQueue from '../TaskQueue'
import { fetchHostList } from './host/HostFile'
import { I18nT } from '@lang/index'

class Nginx extends Base {
  constructor() {
    super()
    this.type = 'nginx'
  }

  init() {
    this.pidPath = join(global.Server.NginxDir!, 'nginx.pid')
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
    return new ForkPromise((resolve, reject, on) => {
      const conf = join(global.Server.NginxDir!, 'conf/nginx.conf')
      if (!existsSync(conf)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
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
      const p = global.Server.NginxDir!

      const pid = join(global.Server.NginxDir!, 'logs/nginx.pid')
      if (existsSync(pid)) {
        try {
          await remove(pid)
        } catch (e) {}
      }

      const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
      await mkdirp(dirname(appPidFile))
      if (existsSync(appPidFile)) {
        try {
          await remove(appPidFile)
        } catch (e) {}
      }

      const baseDir = global.Server.NginxDir!

      const outFile = join(baseDir, 'start.out.log')
      const errFile = join(baseDir, 'start.error.log')

      const execArgs = `-p \`"${p}\`"`

      let psScript = await readFile(join(global.Server.Static!, 'sh/flyenv-async-exec.ps1'), 'utf8')

      psScript = psScript
        .replace('#BIN#', bin)
        .replace('#ARGS#', execArgs)
        .replace('#OUTLOG#', outFile)
        .replace('#ERRLOG#', errFile)

      const psName = `start.ps1`
      const psPath = join(baseDir, psName)
      await writeFile(psPath, psScript)

      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
      })
      process.chdir(baseDir)
      try {
        await spawnPromise(
          'powershell.exe',
          [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            `"Unblock-File -LiteralPath './${psName}'; & './${psName}'"`
          ],
          {
            shell: 'powershell.exe'
          }
        )
      } catch (e: any) {
        on({
          'APP-On-Log': AppLog(
            'error',
            I18nT('appLog.execStartCommandFail', { error: e, service: `nginx-${version.version}` })
          )
        })
        console.log('-k start err: ', e)
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
      if (res) {
        if (res?.pid) {
          on({
            'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: res.pid }))
          })
          await writeFile(appPidFile, res.pid)
          resolve({
            'APP-Service-Start-PID': res.pid
          })
          return
        }
        on({
          'APP-On-Log': AppLog(
            'error',
            I18nT('appLog.startServiceFail', {
              error: res?.error ?? 'Start Fail',
              service: `nginx-${version.version}`
            })
          )
        })
        reject(new Error(res?.error ?? 'Start Fail'))
        return
      }
      let msg = 'Start Fail'
      if (existsSync(errFile)) {
        msg = (await readFile(errFile, 'utf-8')) || 'Start Fail'
      }
      on({
        'APP-On-Log': AppLog(
          'error',
          I18nT('appLog.startServiceFail', { error: msg, service: `nginx-${version.version}` })
        )
      })
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
