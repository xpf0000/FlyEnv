import { getSubDir } from '@shared/file'
import IPC from '@/util/IPC.js'
import { reactive } from 'vue'
import { BrewStore } from '@/store/brew'
import type { AppSofts } from '@/store/app'
import { AppStore } from '@/store/app'

const { getGlobal } = require('@electron/remote')
const { join } = require('path')
const { existsSync, realpathSync } = require('fs')

class InstalledVersions {
  _cb: Array<Function>
  task: { [key: string]: boolean }
  constructor() {
    this._cb = []
    this.task = {}
  }
  allInstalledVersions(flag: keyof typeof AppSofts) {
    if (this.task[flag]) {
      return this
    }
    this.task[flag] = true
    const data = BrewStore()[flag]
    console.log('allInstalledVersions: ', data)
    const searchNames: { [key: string]: string } = {
      apache: 'httpd',
      nginx: 'nginx',
      php: 'php',
      mysql: 'mysql',
      memcached: 'memcached',
      redis: 'redis'
    }
    const binNames: { [key: string]: string } = {
      apache: 'apachectl',
      nginx: 'nginx',
      php: 'php-fpm',
      mysql: 'mysqld_safe',
      memcached: 'memcached',
      redis: 'redis-server'
    }

    const customDirs: Array<string> = AppStore()?.config?.setup?.[flag]?.dirs ?? []
    const binName = binNames[flag]

    const findInstalled = (dir: string, depth = 0, maxDepth = 2) => {
      let res = false
      let binPath = join(dir, `bin/${binName}`)
      if (existsSync(binPath)) {
        return realpathSync(binPath)
      }
      binPath = join(dir, `sbin/${binName}`)
      if (existsSync(binPath)) {
        return realpathSync(binPath)
      }
      if (depth >= maxDepth) {
        return res
      }
      const sub = getSubDir(dir)
      sub.forEach((s: string) => {
        res = res || findInstalled(s, depth + 1, maxDepth)
      })
      return res
    }

    const callBack = () => {
      this._cb.forEach((cb) => {
        if (typeof cb === 'function') {
          cb(true)
        }
      })
      this._cb = []
      delete this.task[flag]
    }

    if (!data.installedInited) {
      const old = [...data.installed]
      data.installed.splice(0)
      const searchName = searchNames[flag]
      const installed = new Set()
      const systemDirs = ['/', '/opt', '/usr']
      systemDirs.forEach((s) => {
        const bin = findInstalled(s, 0, 1)
        if (bin) {
          installed.add(bin)
        }
      })

      if (!global?.Server?.BrewCellar) {
        global.Server = getGlobal('Server')
      }

      const base = global.Server?.BrewCellar ?? ''
      if (base) {
        getSubDir(base)
          .filter((f: string) => {
            return f.includes(searchName)
          })
          .forEach((f: string) => {
            getSubDir(f).forEach((s: string) => {
              const bin = findInstalled(s)
              if (bin) {
                installed.add(bin)
              }
            })
          })
      }

      customDirs.forEach((s: string) => {
        const bin = findInstalled(s, 0, 1)
        if (bin) {
          installed.add(bin)
        }
      })
      console.log('installed: ', installed)
      const count = installed.size
      if (count === 0) {
        setTimeout(() => {
          data.installedInited = true
          old.splice(0)
          callBack()
        }, 30)
        return this
      }
      let index = 0
      installed.forEach((i: string) => {
        const path = i.replace(`/sbin/${binName}`, '').replace(`/bin/${binName}`, '')
        IPC.send('app-fork:brew', 'binVersion', i, binName).then((key: string, res: any) => {
          IPC.off(key)
          if (res?.version) {
            const num = Number(res.version.split('.').slice(0, 2).join(''))
            const item = {
              version: res.version,
              bin: i,
              path: `${path}/`,
              num,
              run: false,
              running: false
            }
            const find = old.find((o) => o.path === item.path && o.version === item.version)
            Object.assign(item, find)
            data.installed.push(reactive(item))
          }
          index += 1
          if (index === count) {
            data.installedInited = true
            data.installed.sort((a: any, b: any) => {
              return b.num - a.num
            })
            old.splice(0)
            callBack()
          }
        })
      })
    } else {
      setTimeout(() => {
        callBack()
      }, 30)
    }

    return this
  }
  then(cb: Function) {
    this._cb.push(cb)
  }
}

export default new InstalledVersions()