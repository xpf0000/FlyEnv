import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  execPromise,
  serviceStartExec,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  readFile,
  writeFile,
  mkdirp,
  machineId,
  serviceStartExecWin,
  moveChildDirToParent
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '@lang/index'
import TaskQueue from '../../TaskQueue'
import axios from 'axios'
import http from 'http'
import https from 'https'
import { publicDecrypt } from 'crypto'
import { EOL } from 'os'
import { isLinux, isWindows } from '@shared/utils'

class Ollama extends Base {
  chats: Record<string, AbortController> = {}

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
      const baseDir = join(global.Server.BaseDir!, 'ollama')
      await mkdirp(baseDir)
      const execArgs = `serve`

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

      const opt = await getConfEnv()

      if (isWindows()) {
        const envs: string[] = []
        for (const k in opt) {
          const v = opt[k]
          envs.push(`$env:${k}="${v}"`)
        }
        envs.push('')
        const execEnv = envs.join(EOL)
        try {
          const res = await serviceStartExecWin({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs,
            execEnv,
            on,
            checkPidFile: false
          })
          resolve(res)
        } catch (e: any) {
          console.log('-k start err: ', e)
          reject(e)
          return
        }
      } else {
        const envs: string[] = []
        for (const k in opt) {
          const v = opt[k]
          envs.push(`export ${k}="${v}"`)
        }
        envs.push('')

        const execEnv = envs.join(EOL)

        try {
          const res = await serviceStartExec({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs,
            execEnv,
            on,
            checkPidFile: false
          })
          resolve(res)
        } catch (e: any) {
          console.log('-k start err: ', e)
          reject(e)
          return
        }
      }
    })
  }

  allModel(version: SoftInstalled) {
    return new ForkPromise(async (resolve) => {
      let command = ''
      if (isWindows()) {
        command = `ollama.exe list`
      } else {
        command = `cd "${dirname(version.bin)}" && ./ollama list`
      }
      let res: any
      try {
        res = await execPromise(command, {
          cwd: dirname(version.bin)
        })
      } catch {}
      const arr = res?.stdout?.split('\n')?.filter((s: string) => !!s.trim()) ?? []
      const list: any = []
      arr.shift()
      arr.forEach((s: string) => {
        const sarr = s.split(' ').filter((s) => !!s.trim())
        list.push({
          name: sarr[0],
          size: sarr[2]
        })
      })
      resolve(list)
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('ollama')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isWindows()) {
            dir = join(global.Server.AppDir!, `ollama-${a.version}`, 'ollama.exe')
            zip = join(global.Server.Cache!, `ollama-${a.version}.zip`)
            a.appDir = join(global.Server.AppDir!, `ollama-${a.version}`)
          } else {
            dir = join(global.Server.AppDir!, `static-ollama-${a.version}`, 'ollama')
            zip = join(global.Server.Cache!, `static-ollama-${a.version}.tgz`)
            a.appDir = join(global.Server.AppDir!, `static-ollama-${a.version}`)
          }

          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `Ollama-${a.version}`
        })
        resolve(all)
      } catch {
        resolve({})
      }
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    if (isLinux()) {
      const dir = row.appDir
      await super._installSoftHandle(row)
      await moveChildDirToParent(dir)
    } else {
      await super._installSoftHandle(row)
    }
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.ollama?.dirs ?? [], 'ollama.exe')]
      } else {
        all = [versionLocalFetch(setup?.ollama?.dirs ?? [], 'ollama', 'ollama')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) =>
            TaskQueue.run(
              versionBinVersion,
              item.bin,
              `"${item.bin}" -v`,
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
      } catch {}
      return resolve(list)
    })
  }

  chat(param: any, t: number, key: string) {
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

      const controller = new AbortController()
      this.chats[key] = controller

      param.signal = controller.signal

      axios(param)
        .then((response) => {
          const reader = new TextDecoder()

          // 定义数据处理器
          const onData = (chunk: any) => {
            try {
              const text = reader.decode(chunk)
              const json = JSON.parse(text)
              on(json)
              if (json.done) {
                cleanup() // 正常结束时清理
                delete this?.chats?.[key]
                resolve(true)
              }
            } catch (e: any) {
              cleanup()
              reject(e)
            }
          }

          const cleanup = () => {
            response.data.off('data', onData)
            response.data.destroy()
            delete this?.chats?.[key]
          }

          response.data.on('data', onData)

          // 监听取消信号（可选，AbortController 已绑定）
          controller.signal.addEventListener('abort', () => {
            cleanup()
            resolve(true)
          })
        })
        .catch((e) => {
          if (axios.isCancel(e)) {
            // 取消请求的错误已由 abort 事件处理，此处可忽略
            return
          }
          delete this?.chats?.[key]
          reject(e)
        })
    })
  }

  stopOutput(chatKey: string) {
    return new ForkPromise((resolve) => {
      this.chats?.[chatKey]?.abort?.()
      delete this?.chats?.[chatKey]
      resolve(true)
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
