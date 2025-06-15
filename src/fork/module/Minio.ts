import { basename, dirname, join } from 'path'
import { createWriteStream, existsSync, unlinkSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { SoftInstalled } from '@shared/app'
import {
  AppLog,
  serviceStartExec,
  spawnPromise,
  versionBinVersion,
  versionFilterSame,
  versionLocalFetch,
  versionSort
} from '../Fn'
import { copyFile, mkdirp, remove, writeFile, readFile } from 'fs-extra'
import TaskQueue from '../TaskQueue'
import { I18nT } from '@lang/index'
import axios from 'axios'

class Minio extends Base {
  constructor() {
    super()
    this.type = 'minio'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'minio/minio.pid')
  }

  initConfig(): ForkPromise<string> {
    return new ForkPromise(async (resolve) => {
      const baseDir = join(global.Server.BaseDir!, 'minio')
      if (!existsSync(baseDir)) {
        await mkdirp(baseDir)
      }
      const iniFile = join(baseDir, 'minio.conf')
      if (!existsSync(iniFile)) {
        await writeFile(iniFile, '')
      }
      resolve(iniFile)
    })
  }

  fetchAllOnlineVersion() {
    console.log('Tomcat fetchAllOnlineVersion !!!')
    return new ForkPromise(async (resolve) => {
      const bin = join(global.Server.AppDir!, `minio`, 'minio.exe')
      const zip = join(global.Server.Cache!, 'minio.exe')
      const all: any[] = [
        {
          url: 'https://dl.min.io/server/minio/release/windows-amd64/minio.exe',
          appDir: join(global.Server.AppDir!, `minio`),
          bin,
          zip,
          downloaded: existsSync(zip),
          installed: existsSync(bin),
          version: 'lasted'
        }
      ]
      resolve(all)
    })
  }

  _startServer(version: SoftInstalled, lastVersion?: SoftInstalled, DATA_DIR?: string) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })

      const iniFile = await this.initConfig().on(on)

      let address = ''
      let console_address = ''
      let certs_dir = ''

      const getConfEnv = async () => {
        const content = await readFile(iniFile, 'utf-8')
        const arr = content
          .split('\n')
          .filter((s) => {
            const str = s.trim()
            return !!str && str.startsWith('MINIO_')
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

      const envs: string[] = []
      for (const k in opt) {
        const v = opt[k]
        if (k === 'MINIO_ADDRESS') {
          address = v
        } else if (k === 'MINIO_CONSOLE_ADDRESS') {
          console_address = v
        } else if (k === 'MINIO_CERTS_DIR') {
          certs_dir = v
        }
        envs.push(`export ${k}="${v}"`)
      }
      envs.push('')

      const bin = version.bin
      const baseDir = join(global.Server.BaseDir!, 'minio')
      const dataDir = DATA_DIR ?? join(baseDir, 'data')
      await mkdirp(dataDir)
      let execArgs = `server \`"${dataDir}\`"`
      const execEnv = envs.join('\n')
      if (address) {
        execArgs += ` --address "${address}"`
      }
      if (console_address) {
        execArgs += ` --console-address "${console_address}"`
      }
      if (certs_dir) {
        execArgs += ` --certs-dir "${certs_dir}"`
      }

      try {
        const res = await serviceStartExec(
          version,
          this.pidPath,
          baseDir,
          bin,
          execArgs,
          execEnv,
          on,
          20,
          500,
          false
        )
        resolve(res)
      } catch (e: any) {
        console.log('-k start err: ', e)
        reject(e)
        return
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.minio?.dirs ?? [], 'minio.exe')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `${basename(item.bin)} --version`
            const reg = /(version )(.*?)( )/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then(async (list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            Object.assign(versions[i], {
              version: version,
              num: 0,
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

  installSoft(row: any) {
    return new ForkPromise(async (resolve, reject, on) => {
      const service = basename(row.appDir)
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.startInstall', { service }))
      })
      const refresh = () => {
        row.downloaded = existsSync(row.zip)
        row.installed = existsSync(row.bin)
      }

      const doHandleZip = async () => {
        await mkdirp(dirname(row.bin))
        await copyFile(row.zip, row.bin)
      }

      if (existsSync(row.zip)) {
        let zipCheck = false
        try {
          spawnPromise(basename(row.zip), ['--version'], {
            shell: false,
            cwd: dirname(row.zip)
          })
          zipCheck = true
        } catch (e) {
          zipCheck = false
        }

        if (zipCheck) {
          on({
            'APP-On-Log': AppLog('info', I18nT('appLog.installFromZip', { service }))
          })
          row.progress = 100
          on(row)
          let success = false
          try {
            await doHandleZip()
            success = true
            refresh()
          } catch (e) {
            refresh()
            console.log('ERROR: ', e)
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.installFromZipFail', { error: e }))
            })
          }
          if (success) {
            row.downState = 'success'
            row.progress = 100
            on(row)
            if (row.installed) {
              on({
                'APP-On-Log': AppLog(
                  'info',
                  I18nT('appLog.installSuccess', { service, appDir: row.appDir })
                )
              })
            } else {
              on({
                'APP-On-Log': AppLog(
                  'error',
                  I18nT('appLog.installFail', { service, error: 'null' })
                )
              })
            }
            resolve(true)
            return
          }
        }
        await remove(row.zip)
      }

      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.startDown', { service, url: row.url }))
      })

      axios({
        method: 'get',
        url: row.url,
        proxy: this.getAxiosProxy(),
        responseType: 'stream',
        onDownloadProgress: (progress) => {
          if (progress.total) {
            const percent = Math.round((progress.loaded * 100.0) / progress.total)
            row.progress = percent
            on(row)
          }
        }
      })
        .then(function (response) {
          const stream = createWriteStream(row.zip)
          response.data.pipe(stream)
          stream.on('error', (err: any) => {
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.downFail', { service, error: err }))
            })
            console.log('stream error: ', err)
            row.downState = 'exception'
            try {
              if (existsSync(row.zip)) {
                unlinkSync(row.zip)
              }
            } catch (e) {}
            refresh()
            on(row)
            setTimeout(() => {
              resolve(false)
            }, 1500)
          })
          stream.on('finish', async () => {
            on({
              'APP-On-Log': AppLog('info', I18nT('appLog.downSuccess', { service }))
            })
            row.downState = 'success'
            try {
              if (existsSync(row.zip)) {
                await doHandleZip()
              }
              refresh()
            } catch (e) {
              refresh()
              on({
                'APP-On-Log': AppLog('info', I18nT('appLog.installFail', { service, error: e }))
              })
            }
            on(row)
            if (row.installed) {
              on({
                'APP-On-Log': AppLog(
                  'info',
                  I18nT('appLog.installSuccess', { service, appDir: row.appDir })
                )
              })
            } else {
              on({
                'APP-On-Log': AppLog(
                  'error',
                  I18nT('appLog.installFail', { service, error: 'null' })
                )
              })
            }
            resolve(true)
          })
        })
        .catch((err) => {
          on({
            'APP-On-Log': AppLog('error', I18nT('appLog.downFail', { service, error: err }))
          })
          console.log('down error: ', err)
          row.downState = 'exception'
          try {
            if (existsSync(row.zip)) {
              unlinkSync(row.zip)
            }
          } catch (e) {}
          refresh()
          on(row)
          setTimeout(() => {
            resolve(false)
          }, 1500)
        })
    })
  }
}
export default new Minio()
