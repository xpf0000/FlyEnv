import { basename, dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  execPromiseRoot,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort
} from '../Fn'
import { readFile, writeFile } from 'fs-extra'
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

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
      const bin = version.bin
      await makeGlobalTomcatServerXML(version)
      await this._fixStartBat(version)

      process.chdir(dirname(bin))

      const command = `start /b ${basename(bin)} --APPFLAG="${global.Server.BaseDir!}"`
      console.log('command: ', command)

      try {
        const res = await execPromiseRoot(command)
        console.log('start res: ', res)
        resolve(0)
      } catch (e: any) {
        reject(e)
      }
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
