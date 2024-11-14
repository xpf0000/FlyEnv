import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
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
import { readFile, writeFile, mkdirp } from 'fs-extra'
import { I18nT } from '../lang'
import { execPromiseRoot } from '@shared/Exec'
import { type ChildProcess, spawn } from 'child_process'
import { fixEnv } from '@shared/utils'
import TaskQueue from '../TaskQueue'

class MailPit extends Base {
  constructor() {
    super()
    this.type = 'mailpit'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'mailpit/mailpit.pid')
  }

  initConfig(): ForkPromise<string> {
    return new ForkPromise(async (resolve) => {
      const baseDir = join(global.Server.BaseDir!, 'mailpit')
      if (!existsSync(baseDir)) {
        await mkdirp(baseDir)
      }
      const iniFile = join(baseDir, 'mailpit.conf')
      if (!existsSync(iniFile)) {
        const tmplFile = join(global.Server.Static!, 'tmpl/mailpit.conf')
        let content = await readFile(tmplFile, 'utf-8')
        const logFile = join(baseDir, 'mailpit.log')
        content = content.replace('##LOG_FILE##', logFile)
        await writeFile(iniFile, content)
        const defaultIniFile = join(baseDir, 'mailpit.conf.default')
        await writeFile(defaultIniFile, content)
      }
      resolve(iniFile)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
      const bin = version.bin
      const iniFile = await this.initConfig()
      if (existsSync(this.pidPath)) {
        await execPromiseRoot(['rm', '-rf', this.pidPath])
      }
      const env = await fixEnv()
      let child: ChildProcess
      if (global.Server.isAppleSilicon) {
        const sslDir = join(global.Server.BaseDir!, 'mailpit/ssl')
        if (existsSync(sslDir)) {
          const res = await execPromise(`ls -al "${sslDir}"`)
          if (res.stdout.includes(' root ')) {
            await execPromiseRoot(['rm', '-rf', sslDir])
          }
        }
        child = spawn(
          bin,
          ['start', '--config', iniFile, '--pidfile', this.pidPath, '--watch', '&'],
          {
            detached: true,
            stdio: 'ignore',
            env
          }
        )
      } else {
        child = spawn(
          'sudo',
          ['-S', bin, 'start', '--config', iniFile, '--pidfile', this.pidPath, '--watch', '&'],
          {
            detached: true,
            env
          }
        )
      }

      let checking = false
      const checkPid = async (time = 0) => {
        if (existsSync(this.pidPath)) {
          try {
            await execPromiseRoot(['kill', '-9', `${child.pid}`])
          } catch (e) {}
          resolve(true)
        } else {
          if (time < 40) {
            await waitTime(500)
            await checkPid(time + 1)
          } else {
            try {
              await execPromiseRoot(['kill', '-9', `${child.pid}`])
            } catch (e) {}
            reject(new Error(I18nT('fork.startFail')))
          }
        }
      }

      const onPassword = (data: Buffer) => {
        const str = data.toString()
        if (str.startsWith('Password:')) {
          child?.stdin?.write(global.Server.Password!)
          child?.stdin?.write(`\n`)
          return
        }
        if (!checking) {
          checking = true
          checkPid()
        }
      }
      child?.stdout?.on('data', (data: Buffer) => {
        onPassword(data)
      })
      child?.stderr?.on('data', (err: Buffer) => {
        onPassword(err)
      })
      child.on('exit', (err) => {
        console.log('exit: ', err)
        onPassword(Buffer.from(''))
      })
      child.on('close', (code) => {
        console.log('close: ', code)
        onPassword(Buffer.from(''))
      })
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('mailpit')
        const dict: any = {}
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `static-mailpit-${a.version}`, 'mailpit')
          const zip = join(global.Server.Cache!, `static-mailpit-${a.version}.tar.gz`)
          a.appDir = join(global.Server.AppDir!, `static-mailpit-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          dict[`mailpit-${a.version}`] = a
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
      Promise.all([versionLocalFetch(setup?.mailpit?.dirs ?? [], 'mailpit', 'mailpit')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) =>
            TaskQueue.run(versionBinVersion, `${item.bin} version`, /(v)(\d+(\.\d+){1,4})( )/g)
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
        const all = ['mailpit']
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
export default new MailPit()
