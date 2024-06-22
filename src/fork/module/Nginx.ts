import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { SoftInstalled } from '@shared/app'
import { execPromiseRoot, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp, unlink } from 'fs-extra'
import { zipUnPack } from '@shared/file'
import axios from 'axios'
import { compareVersions } from 'compare-versions'

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
            .replace('#VHostPath#', join(global.Server.BaseDir!, 'vhost/nginx').split('\\').join('/'))
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

  #initLocalApp(version: SoftInstalled) {
    return new Promise((resolve) => {
      console.log('initLocalApp: ', version.bin, global.Server.AppDir)
      if (!existsSync(version.bin) && version.bin.includes(join(global.Server.AppDir!, `nginx-${version.version}`))) {
        zipUnPack(join(global.Server.Static!, `zip/nginx-${version.version}.7z`), global.Server.AppDir!)
        .then(resolve)
        .catch(resolve)
        return
      }
      resolve(true)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      await this.#initLocalApp(version)
      await this.#initConfig()
      await this.#handlePhpEnableConf()
      console.log('_startServer: ', version)
      const bin = version.bin
      const p = global.Server.NginxDir!
      const pid = join(global.Server.NginxDir!, 'logs/nginx.pid')

      try {
        if (existsSync(pid)) {
          await unlink(pid)
        }
      } catch (e) {}
      
      const waitPid = async (time = 0): Promise<boolean> => {
        let res = false
        if (existsSync(pid)) {
          res = true
        } else {
          if (time < 40) {
            await waitTime(500)
            res = res || await waitPid(time + 1)
          } else {
            res = false
          }
        }
        console.log('waitPid: ', time, res)
        return res
      }

      const command = `start /b ${bin} -p ${p}`
      console.log('command: ', command)

      try {
        const res = await execPromiseRoot(command)
        console.log('res: ', res)
        on(res.stdout)
        const check = await waitPid()
        if (check) {
          resolve(0)
        } else {
          reject(new Error('Start failed'))
        }
      } catch (e: any) {
        reject(e)
      }
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const urls = [
          'https://nginx.org/en/download.html'        
      ]
      const fetchVersions = async (url: string) => {
          const all: any = []
          const res = await axios({
            url,
            method: 'get'
        })
        const html = res.data        
        const reg = /\/download\/nginx-(\d[\d\.]+)\.zip/g
        let r
        while((r = reg.exec(html)) !== null) {          
            const u = new URL(r[0], url).toString()
            const version = r[1]
            const mv = version.split('.').slice(0, 2).join('.')
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
        }
        return all
      }
      const all: any = []
      const res = await Promise.all(urls.map((u) => fetchVersions(u)))
      const list = res.flat()
      list.filter((l:any) => compareVersions(l.version, '1.12.0') > 0).forEach((l: any) => {
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
        const dir = join(global.Server.AppDir!, `nginx-${a.version}`, `nginx-${a.version}`, 'nginx.exe')
        const zip = join(global.Server.Cache!, `nginx-${a.version}.zip`)
        a.appDir = join(global.Server.AppDir!, `nginx-${a.version}`)
        a.zip = zip
        a.bin = dir
        a.downloaded = existsSync(zip)
        a.installed = existsSync(dir)
      })
          resolve(all)
      } catch(e) {
        resolve([])
      }    
    })
  }
}
export default new Nginx()
