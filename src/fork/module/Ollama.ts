import { basename, dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  execPromise,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  waitTime
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp, remove, chmod } from 'fs-extra'
import { I18nT } from '../lang'
import TaskQueue from '../TaskQueue'
import axios from 'axios'
import http from 'http'
import https from 'https'

class Ollama extends Base {
  constructor() {
    super()
    this.type = 'ollama'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'ollama/ollama.pid')
  }

  initConfig(): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      const baseDir = join(global.Server.BaseDir!, 'ollama')
      if (!existsSync(baseDir)) {
        await mkdirp(baseDir)
      }
      const iniFile = join(baseDir, 'ollama.conf')
      if (!existsSync(iniFile)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        await writeFile(iniFile, '')
        const defaultIniFile = join(baseDir, 'ollama.conf.default')
        await writeFile(defaultIniFile, '')
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: iniFile }))
        })
      }
      resolve(iniFile)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `ollama-${version.version}` })
        )
      })
      const bin = version.bin
      const iniFile = await this.initConfig().on(on)
      if (existsSync(this.pidPath)) {
        try {
          await remove(this.pidPath)
        } catch (e) {}
      }

      const checkPid = async (time = 0) => {
        console.log('checkPid: ', time)
        if (existsSync(this.pidPath)) {
          const pid = await readFile(this.pidPath, 'utf-8')
          on({
            'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: pid.trim() }))
          })
          resolve({
            'APP-Service-Start-PID': pid.trim()
          })
        } else {
          if (time < 10) {
            await waitTime(500)
            await checkPid(time + 1)
          } else {
            on({
              'APP-On-Log': AppLog(
                'error',
                I18nT('appLog.startServiceFail', {
                  error: I18nT('fork.startFail'),
                  service: `ollama-${version.version}`
                })
              )
            })
            reject(new Error(I18nT('fork.startFail')))
          }
        }
      }

      const getConfEnv = async () => {
        const content = await readFile(iniFile, 'utf-8')
        const arr = content
          .split('\n')
          .filter((s) => {
            const str = s.trim()
            return !!str && str.startsWith('OLLAMA_')
          })
          .map((s) => s.trim())
        const dict: Record<string, string> = {}
        arr.forEach((a) => {
          const item = a.split('=')
          const k = item.shift()
          const v = item.join('=')
          if (k) {
            dict[k] = v
          }
        })
        return dict
      }

      const log = join(global.Server.BaseDir!, 'ollama/ollama.log')

      const opt = await getConfEnv()
      const commands: string[] = ['#!/bin/zsh']
      for (const k in opt) {
        const v = opt[k]
        if (v.includes(' ')) {
          commands.push(`export ${k}="${v}"`)
        } else {
          commands.push(`export ${k}=${v}`)
        }
      }
      commands.push(`cd "${dirname(bin)}"`)
      commands.push(`nohup ./${basename(bin)} serve >> "${log}" 2>&1 &`)
      commands.push(`echo $! > "${this.pidPath}"`)
      const command = commands.join('\n')
      console.log('command: ', command)
      const sh = join(global.Server.BaseDir!, `ollama/start.sh`)
      await writeFile(sh, command)
      await chmod(sh, '0777')
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
      })
      try {
        const res = await execPromise(`zsh "${sh}"`)
        console.log('start res: ', res)
      } catch (e) {
        on({
          'APP-On-Log': AppLog(
            'error',
            I18nT('appLog.execStartCommandFail', { error: e, service: `ollama-${version.version}` })
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
      await checkPid()
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('ollama')
        const dict: any = {}
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `static-ollama-${a.version}`, 'ollama')
          const zip = join(global.Server.Cache!, `static-ollama-${a.version}.tgz`)
          a.appDir = join(global.Server.AppDir!, `static-ollama-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          dict[`ollama-${a.version}`] = a
        })
        resolve(dict)
      } catch (e) {
        resolve({})
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.ollama?.dirs ?? [], 'ollama', 'ollama')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) =>
            TaskQueue.run(versionBinVersion, `${item.bin} -v`, /( )(\d+(\.\d+){1,4})(.*?)/g)
          )
          return Promise.all(all)
        })
        .then((list) => {
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
        const all = ['ollama']
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

  fetchAllModels() {
    return new ForkPromise(async (resolve) => {
      let list: any = []
      try {
        const res = await axios({
          url: 'https://api.one-env.com/api/version/fetch',
          method: 'post',
          data: {
            app: 'ollama_models',
            os: 'mac',
            arch: global.Server.Arch === 'x86_64' ? 'x86' : 'arm'
          },
          timeout: 30000,
          withCredentials: false,
          httpAgent: new http.Agent({ keepAlive: false }),
          httpsAgent: new https.Agent({ keepAlive: false }),
          proxy: this.getAxiosProxy()
        })
        list = res?.data?.data ?? []
      } catch (e) {}
      return resolve(list)
    })
  }
}
export default new Ollama()
