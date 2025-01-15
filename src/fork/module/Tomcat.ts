import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import { execPromiseRoot, execPromiseRootWhenNeed } from '@shared/Exec'
import {
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

class Tomcat extends Base {
  constructor() {
    super()
    this.type = 'tomcat'
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

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
      const bin = version.bin
      await makeGlobalTomcatServerXML(version)
      if (existsSync(this.pidPath)) {
        await execPromiseRoot(['rm', '-rf', this.pidPath])
      }
      try {
        await execPromiseRootWhenNeed('zsh', [bin, `--PWSAPPFLAG=${global.Server.BaseDir!}`])
        resolve(0)
      } catch (e: any) {
        reject(e)
      }
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
