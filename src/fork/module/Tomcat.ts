import { basename, dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import { execPromiseRoot, execPromiseRootWhenNeed } from '@shared/Exec'
import {
  AppLog,
  brewInfoJson,
  brewSearch,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort
} from '../Fn'
import TaskQueue from '../TaskQueue'
import { makeGlobalTomcatServerXML } from './service/ServiceItemJavaTomcat'
import { copyFile, mkdirp, remove, writeFile } from 'fs-extra'
import { I18nT } from '../lang'

class Tomcat extends Base {
  constructor() {
    super()
    this.type = 'tomcat'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'tomcat/tomcat.pid')
  }

  fetchAllOnLineVersion() {
    console.log('Tomcat fetchAllOnLineVersion !!!')
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('tomcat')
        const dict: any = {}
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `static-tomcat-${a.version}`, 'bin/catalina.sh')
          const zip = join(global.Server.Cache!, `static-tomcat-${a.version}.tar.gz`)
          a.appDir = join(global.Server.AppDir!, `static-tomcat-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          dict[`tomcat-${a.version}`] = a
        })
        resolve(dict)
      } catch (e) {
        resolve({})
      }
    })
  }

  _initDefaultDir(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      const v = version?.version?.split('.')?.shift() ?? ''
      const dir = join(global.Server.BaseDir!, `tomcat/tomcat${v}`)
      if (existsSync(dir) && existsSync(join(dir, 'conf/server.xml'))) {
        resolve(dir)
      }
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
      })
      const files = [
        'catalina.policy',
        'catalina.properties',
        'context.xml',
        'jaspic-providers.xml',
        'jaspic-providers.xsd',
        'tomcat-users.xml',
        'tomcat-users.xsd',
        'logging.properties',
        'web.xml',
        'server.xml'
      ]
      const fromConfDir = join(dirname(dirname(version.bin)), 'conf')
      const toConfDir = join(dir, 'conf')
      await mkdirp(toConfDir)
      for (const file of files) {
        const src = join(fromConfDir, file)
        if (existsSync(src)) {
          await copyFile(src, join(toConfDir, file))
        }
      }
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.confInitSuccess', { file: join(dir, 'conf/server.xml') })
        )
      })
      resolve(dir)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      const bin = version.bin
      const baseDir: any = await this._initDefaultDir(version).on(on)
      await makeGlobalTomcatServerXML({
        path: baseDir
      } as any)
      if (existsSync(this.pidPath)) {
        try {
          await remove(this.pidPath)
        } catch (e) {}
      }
      const tomcatDir = join(global.Server.BaseDir!, 'tomcat')

      await mkdirp(join(baseDir, 'logs'))

      const startLog = join(tomcatDir, 'start.log')
      const startErrorLog = join(tomcatDir, 'start.error.log')
      if (existsSync(startErrorLog)) {
        try {
          await remove(startErrorLog)
        } catch (e) {}
      }

      const commands: string[] = [
        '#!/bin/zsh',
        `export CATALINA_BASE="${baseDir}"`,
        `export CATALINA_PID="${this.pidPath}"`,
        `cd "${dirname(bin)}"`,
        `nohup ./${basename(bin)} > "${startLog}" 2>"${startErrorLog}" &`
      ]

      const command = commands.join('\n')
      console.log('command: ', command)
      const sh = join(tomcatDir, `start.sh`)
      await writeFile(sh, command)
      await execPromiseRoot([`chmod`, '777', sh])
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
      })
      let res: any
      try {
        res = await execPromiseRootWhenNeed(`zsh`, [sh])
        console.log('start res: ', res)
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
      res = await this.waitPidFile(this.pidPath, startErrorLog)
      if (res && res?.pid) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: res.pid }))
        })
        resolve({
          'APP-Service-Start-PID': res.pid
        })
        return
      }
      on({
        'APP-On-Log': AppLog(
          'error',
          I18nT('appLog.execStartCommandFail', {
            error: res ? res?.error : 'Start Fail',
            service: `${this.type}-${version.version}`
          })
        )
      })
      reject(new Error('Start Fail'))
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.tomcat?.dirs ?? [], 'catalina.sh', 'tomcat')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all: any[] = []
          for (const item of versions) {
            const bin = join(dirname(item.bin), 'version.sh')
            await execPromiseRoot(['chmod', '777', bin])
            const command = `${bin}`
            const reg = /(Server version: Apache Tomcat\/)(.*?)(\n)/g
            all.push(TaskQueue.run(versionBinVersion, command, reg))
          }
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            const num = version
              ? Number(versionFixed(version).split('.').slice(0, 2).join(''))
              : null
            Object.assign(versions[i], {
              bin: join(dirname(versions[i].bin), 'startup.sh'),
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
        let all: Array<string> = []
        const cammand = 'brew search -q --formula "/^tomcat((@[\\d\\.]+)?)$/"'
        all = await brewSearch(all, cammand)
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
      resolve({})
    })
  }
}
export default new Tomcat()
