import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import axios from 'axios'
import { compareVersions } from 'compare-versions'

class Composer extends Base {
  constructor() {
    super()
    this.type = 'composer'
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const urls = [
          'https://api.github.com/repos/composer/composer/tags?page=1&per_page=1000',
        ]
        const fetchVersions = async (url: string) => {
          const all: any = []
          const res = await axios({
            url,
            method: 'get'
          })
          const html = res.data
          let arr: any[] = []
          try {
            if (typeof html === 'string') {
              arr = JSON.parse(html)
            } else {
              arr = html
            }
          } catch (e) { }
          arr.forEach((a) => {
            const version = a.name.replace('v', '')
            const mv = version.split('.').slice(0, 2).join('.')
            const u = `https://getcomposer.org/download/${version}/composer.phar`
            const item = {
              url: u,
              version,
              mVersion: mv
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
          })
          return all
        }
        const all: any = []
        const res = await Promise.all(urls.map((u) => fetchVersions(u)))
        const list = res.flat()
        list.filter((l: any) => compareVersions(l.version, '2.0.0') > 0).forEach((l: any) => {
          const find = all.find((f: any) => f.mVersion === l.mVersion)
          if (!find) {
            all.push(l)
          } else {
            if (compareVersions(l.version, find.version) > 0) {
              const index = all.indexOf(find)
              all.splice(index, 1, l)
            }
          }
        })

        all.sort((a: any, b: any) => {
          return compareVersions(b.version, a.version)
        })

        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `composer-${a.version}`, 'composer.phar')
          const zip = join(global.Server.Cache!, `composer-${a.version}.phar`)
          a.appDir = join(global.Server.AppDir!, `composer-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.type = 'composer'
        })
        resolve(all)
      } catch (e) {
        resolve([])
      }
    })
  }

}
export default new Composer()
