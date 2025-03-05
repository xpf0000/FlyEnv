import { basename, dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  execPromise,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  waitTime
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp, remove } from 'fs-extra'
import { I18nT } from '../lang'
import TaskQueue from '../TaskQueue'
import axios from 'axios'
import http from 'http'
import https from 'https'
import { machineId } from 'node-machine-id'
import { publicDecrypt } from 'crypto'
import { EOL } from 'os'

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
      const commands: string[] = ['@echo off', 'chcp 65001>nul']
      for (const k in opt) {
        const v = opt[k]
        commands.push(`set "${k}=${v}"`)
      }
      commands.push(`cd "${dirname(bin)}"`)
      commands.push(`start /B ./${basename(bin)} serve >> "${log}" 2>&1 &`)
      commands.push(`echo $! > ${this.pidPath}`)

      const command = commands.join(EOL)
      console.log('command: ', command)
      const cmdName = `start.cmd`
      const sh = join(global.Server.BaseDir!, `ollama/${cmdName}`)
      await writeFile(sh, command)

      const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
      await mkdirp(dirname(appPidFile))
      if (existsSync(appPidFile)) {
        try {
          await remove(appPidFile)
        } catch (e) {}
      }

      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
      })
      process.chdir(join(global.Server.BaseDir!, `ollama`))
      try {
        await execPromise(
          `powershell.exe -Command "(Start-Process -FilePath ./${cmdName} -PassThru -WindowStyle Hidden).Id"`
        )
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

  allModel(version: SoftInstalled) {
    return new ForkPromise(async (resolve) => {

      const command = `ollama.exe list`
      const res = await execPromise(command, {
        cwd: dirname(version.bin)
      })
      const arr = res?.stdout?.split('\n')?.filter((s) => !!s.trim()) ?? []
      const list: any = []
      arr.shift()
      arr.forEach((s) => {
        const sarr = s.split(' ').filter((s) => !!s.trim())
        list.push({
          name: sarr[0],
          size: sarr[2]
        })
      })
      resolve(list)
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('ollama')
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `ollama-${a.version}`, 'ollama.exe')
          const zip = join(global.Server.Cache!, `ollama-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `ollama-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
        })
        resolve(all)
      } catch (e) {
        resolve({})
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.ollama?.dirs ?? [], 'ollama.exe')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) =>
            TaskQueue.run(
              versionBinVersion,
              item.bin,
              `${basename(item.bin)} -v`,
              /( )(\d+(\.\d+){1,4})(.*?)/g
            )
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

  fetchAllModels() {
    return new ForkPromise(async (resolve) => {
      let list: any = []
      try {
        const res = await axios({
          url: 'https://api.one-env.com/api/version/fetch',
          method: 'post',
          data: {
            app: 'ollama_models',
            os: 'win',
            arch: 'x86'
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

  chat(param: any, t: number) {
    return new ForkPromise(async (resolve, reject, on) => {
      let isLock = false
      if (!global.Server.Licenses) {
        isLock = true
      } else {
        const getRSAKey = () => {
          const a = '0+u/eiBrB/DAskp9HnoIgq1MDwwbQRv6rNxiBK/qYvvdXJHKBmAtbe0+SW8clzne'
          const b = 'Kq1BrqQFebPxLEMzQ19yrUyei1nByQwzlX8r3DHbFqE6kV9IcwNh9yeW3umUw05F'
          const c = 'zwIDAQAB'
          const d = 'n7Yl8hRd195GT9h48GsW+ekLj2ZyL/O4rmYRlrNDtEAcDNkI0UG0NlG+Bbn2yN1t'
          const e = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzVJ3axtKGl3lPaUFN82B'
          const f = 'XZW4pCiCvUTSMIU86DkBT/CmDw5n2fCY/FKMQue+WNkQn0mrRphtLH2x0NzIhg+l'
          const g = 'Zkm1wi9pNWLJ8ZvugKZnHq+l9ZmOES/xglWjiv3C7/i0nUtp0sTVNaVYWRapFsTL'
          const arr: string[] = [e, g, b, a, f, d, c]

          const a1 = '-----'
          const a2 = ' PUBLIC KEY'
          const a3 = 'BEGIN'
          const a4 = 'END'

          arr.unshift([a1, a3, a2, a1].join(''))
          arr.push([a1, a4, a2, a1].join(''))

          return arr.join('\n')
        }
        const uuid = await machineId()
        const uid = publicDecrypt(
          getRSAKey(),
          Buffer.from(global.Server.Licenses!, 'base64') as any
        ).toString('utf-8')
        isLock = uid !== uuid
      }
      const currentTime = Math.round(new Date().getTime() / 1000)
      if (isLock && (!t || t + 3 * 24 * 60 * 60 < currentTime)) {
        const msg = I18nT('fork.trialEnd')
        on({
          message: {
            content: msg
          }
        })
        return reject(new Error(msg))
      }

      axios(param)
        .then((response) => {
          const reader = new TextDecoder()
          response.data.on('data', (chunk: any) => {
            const text = reader.decode(chunk)
            const json = JSON.parse(text)
            on(json)
            if (json.done) {
              resolve(true)
            }
          })
        })
        .catch((e) => {
          reject(e)
        })
    })
  }

  models(param: any) {
    return new ForkPromise((resolve, reject) => {
      axios(param)
        .then((response) => {
          resolve(response.data)
        })
        .catch((e) => {
          reject(e)
        })
    })
  }
}
export default new Ollama()
