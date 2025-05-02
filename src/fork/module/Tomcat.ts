import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  serviceStartExec,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  waitTime
} from '../Fn'
import { copyFile, mkdirp, readFile, writeFile } from 'fs-extra'
import TaskQueue from '../TaskQueue'
import { makeGlobalTomcatServerXML } from './service/ServiceItemJavaTomcat'
import { ProcessListSearch } from '../Process'
import { I18nT } from '@lang/index'

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
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `tomcat-${a.version}`, 'bin/catalina.bat')
          const zip = join(global.Server.Cache!, `tomcat-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `tomcat-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
        })
        resolve(all)
      } catch (e) {
        console.log('Tomcat fetch version e: ', e)
        resolve([])
      }
    })
  }

  async _fixStartBat(version: SoftInstalled) {
    const file = join(dirname(version.bin), 'setclasspath.bat')
    if (existsSync(file)) {
      let content = await readFile(file, 'utf-8')
      content = content.replace(
        `set "_RUNJAVA=%JRE_HOME%\\bin\\java.exe"`,
        `set "_RUNJAVA=%JRE_HOME%\\bin\\javaw.exe"`
      )
      await writeFile(file, content)
    }
  }

  _initDefaultDir(version: SoftInstalled, baseDir?: string): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      let dir = ''
      if (baseDir) {
        dir = baseDir
      } else {
        const v = version?.version?.split('.')?.shift() ?? ''
        dir = join(global.Server.BaseDir!, `tomcat/tomcat${v}`)
      }
      if (existsSync(dir) && existsSync(join(dir, 'conf/server.xml'))) {
        resolve(dir)
        return
      }
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
      })
      const files = [
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

  _startServer(version: SoftInstalled, lastVersion?: SoftInstalled, CATALINA_BASE?: string) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      const bin = version.bin
      await this._fixStartBat(version)
      const baseDir: string = await this._initDefaultDir(version, CATALINA_BASE).on(on)
      await makeGlobalTomcatServerXML({
        path: baseDir
      } as any)

      await mkdirp(join(baseDir, 'logs'))

      const tomcatDir = join(global.Server.BaseDir!, 'tomcat')
      const execEnv = `$env:CATALINA_BASE="${baseDir}"`
      const execArgs = ` `

      try {
        await serviceStartExec(
          version,
          this.pidPath,
          tomcatDir,
          bin,
          execArgs,
          execEnv,
          on,
          20,
          500,
          false
        )
      } catch (e: any) {
        console.log('-k start err: ', e)
        reject(e)
        return
      }

      /**
       * "C:\Users\x\Desktop\Git Hub\FlyEnv\data\env\java\bin\javaw.exe"
       * -Djava.util.logging.config.file="C:\Users\x\Desktop\App\CCC\conf\logging.properties"
       * -Djava.util.logging.manager=org.apache.juli.ClassLoaderLogManager
       * -Djdk.tls.ephemeralDHKeySize=2048
       * --add-opens=java.base/java.lang=ALL-UNNAMED
       * --add-opens=java.base/java.lang.reflect=ALL-UNNAMED
       * --add-opens=java.base/java.io=ALL-UNNAMED
       * --add-opens=java.base/java.util=ALL-UNNAMED
       * --add-opens=java.base/java.util.concurrent=ALL-UNNAMED
       * --add-opens=java.rmi/sun.rmi.transport=ALL-UNNAMED
       * --enable-native-access=ALL-UNNAMED
       * -classpath "C:\Users\x\Desktop\Git Hub\FlyEnv\data\app\tomcat-11.0.6\bin\bootstrap.jar;C:\Users\x\Desktop\Git Hub\FlyEnv\data\app\tomcat-11.0.6\bin\tomcat-juli.jar"
       * -Dcatalina.base="C:\Users\x\Desktop\App\CCC"
       * -Dcatalina.home="C:\Users\x\Desktop\Git Hub\FlyEnv\data\app\tomcat-11.0.6"
       * -Djava.io.tmpdir="C:\Users\x\Desktop\App\CCC\temp"
       * org.apache.catalina.startup.Bootstrap start
       */
      const checkPid = (): Promise<{ pid: number } | undefined> => {
        return new Promise((resolve) => {
          const doCheck = async (time: number) => {
            const pids = await ProcessListSearch(`-Dcatalina.base="${baseDir}"`, false)
            if (pids.length > 0) {
              const pid = pids.pop()!
              resolve({
                pid: pid.ProcessId
              })
            } else {
              if (time < 20) {
                await waitTime(2000)
                await doCheck(time + 1)
              } else {
                resolve(undefined)
              }
            }
          }
          doCheck(0).then().catch()
        })
      }
      await waitTime(3000)
      const res = await checkPid()
      if (res && res?.pid) {
        await writeFile(this.pidPath, `${res.pid}`)
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
            error: 'Start failed',
            service: `${this.type}-${version.version}`
          })
        )
      })
      reject(new Error('Start failed'))
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.tomcat?.dirs ?? [], 'catalina.bat')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = 'call version.bat'
            const reg = /(Server version: Apache Tomcat\/)(.*?)(\n)/g
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
              bin: join(dirname(versions[i].bin), 'startup.bat'),
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
}
export default new Tomcat()
