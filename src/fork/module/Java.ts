import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import axios from 'axios'
import { compareVersions } from 'compare-versions'

class Java extends Base {
  constructor() {
    super()
    this.type = 'java'
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const urls = [
          'https://learn.microsoft.com/en-us/java/openjdk/download',
          'https://www.oracle.com/java/technologies/downloads/'
        ]
        const fetchVersions = async (url: string) => {
          const all: any = []
          const res = await axios({
            url,
            method: 'get',
            proxy: this.getAxiosProxy()
          })
          const html = res.data
          const arch = global.Server.Arch === 'x86_64' ? 'x64' : 'aarch64'
          let reg: RegExp
          if (url.includes('learn.microsoft.com')) {
            reg = new RegExp(`https://(.*?)([\\d\\.]+)-macos-${arch}\\.tar\\.gz`, 'g')
          } else {
            reg = new RegExp(`https://(.*?)/jdk-([\\d|\\.]+)_macos-${arch}_bin\\.tar\\.gz`, 'g')
          }
          let r
          while ((r = reg.exec(html)) !== null) {
            const u = r[0]
            const version = r[2]
            const mv = version.split('.').slice(0, 2).join('.')
            const item = {
              url: u,
              version,
              mVersion: mv,
              type: url.includes('learn.microsoft.com') ? 'openjdk' : 'jdk'
            }
            const find = all.find((f: any) => f.mVersion === item.mVersion)
            if (!find) {
              all.push(item)
            } else {
              if (compareVersions(item.version, find.version) > 0) {
                const index = all.indexOf(find)
                all.splice(index, 1, item)
              }
            }
          }
          return all
        }
        const all: any = []
        const res = await Promise.all(urls.map((u) => fetchVersions(u)))
        const list = res.flat()
        all.push(...list)
        const dict: any = {}
        all.forEach((a: any) => {
          const dir = join(
            global.Server.AppDir!,
            `static-${a.type}-${a.version}`,
            'Contents/Home/bin/java'
          )
          const zip = join(global.Server.Cache!, `static-${a.type}-${a.version}.tar.gz`)
          a.appDir = join(global.Server.AppDir!, `static-${a.type}-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          dict[`${a.type}-${a.version}`] = a
        })
        resolve(dict)
      } catch (e) {
        resolve({})
      }
    })
  }
}
export default new Java()
