import { dirname, join } from 'path'
import axios from 'axios'
import * as http from 'http'
import * as https from 'https'
import { Base } from '../Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  binXattrFix,
  chmod,
  execPromiseWithEnv,
  mkdirp,
  moveChildDirToParent,
  remove,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  writeFile
} from '../../Fn'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '@lang/index'
import TaskQueue from '../../TaskQueue'
import { appDebugLog, isMacOS, isWindows } from '@shared/utils'
import { existsSync } from 'fs'
import { compareVersions } from '@shared/compare-versions'

const githubReleasesUrl =
  'https://api.github.com/repos/roadrunner-server/roadrunner/releases?per_page=100'

class RoadRunner extends Base {
  constructor() {
    super()
    this.type = 'roadrunner'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'roadrunner/roadrunner.pid')
  }

  initConfig(): ForkPromise<string> {
    return new ForkPromise(async (resolve, _reject, on) => {
      const baseDir = join(global.Server.BaseDir!, 'roadrunner')
      await mkdirp(baseDir)
      const iniFile = join(baseDir, '.rr.yaml')
      const defaultIniFile = join(baseDir, '.rr.yaml.default')
      const indexFile = join(baseDir, 'index.html')
      if (!existsSync(indexFile)) {
        await writeFile(
          indexFile,
          `<html><body><h1>RoadRunner is running</h1></body></html>
`
        )
      }
      const content = `version: "3"

fileserver:
  address: 127.0.0.1:8080
  calculate_etag: true
  weak: false
  stream_request_body: true
  serve:
    - prefix: "/"
      root: "."
      compress: false
      cache_duration: 10
      max_age: 10
      bytes_range: true
`
      if (!existsSync(iniFile)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        await writeFile(iniFile, content)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: iniFile }))
        })
      }
      if (!existsSync(defaultIniFile)) {
        await writeFile(defaultIniFile, content)
      }
      resolve(iniFile)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `roadrunner-${version.version}` })
        )
      })

      const bin = version.bin
      const baseDir = join(global.Server.BaseDir!, 'roadrunner')
      await mkdirp(baseDir)
      const iniFile = await this.initConfig().on(on)

      try {
        const res = await serviceStartSpawn({
          version,
          pidPath: this.pidPath,
          baseDir,
          bin,
          execArgs: ['serve', '-c', iniFile, '-w', baseDir],
          waitTime: 2000,
          on
        })
        resolve(res)
      } catch (e: any) {
        console.log('roadrunner start err: ', e)
        reject(e)
        return
      }
    })
  }

  releasePlatform() {
    if (isWindows()) {
      return 'windows'
    }
    if (isMacOS()) {
      return 'darwin'
    }
    return 'linux'
  }

  releaseArch() {
    return global.Server.Arch === 'x86_64' ? 'amd64' : 'arm64'
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const platform = this.releasePlatform()
        const arch = this.releaseArch()
        const res = await axios({
          url: githubReleasesUrl,
          method: 'get',
          timeout: 30000,
          withCredentials: false,
          httpAgent: new http.Agent({ keepAlive: false }),
          httpsAgent: new https.Agent({ keepAlive: false }),
          proxy: this.getAxiosProxy()
        })
        const releases = res?.data ?? []
        const all: OnlineVersionItem[] = []
        releases
          .filter((release: any) => !release?.draft && !release?.prerelease)
          .forEach((release: any) => {
            const tag = `${release?.tag_name ?? ''}`
            const version = tag.replace(/^v/, '')
            if (!version) {
              return
            }
            const prefix = `roadrunner-${version}-${platform}-${arch}.`
            const asset = release?.assets?.find((item: any) => {
              const name = `${item?.name ?? ''}`
              return (
                name.startsWith(prefix) &&
                (name.endsWith('.tar.gz') || name.endsWith('.zip')) &&
                !name.endsWith('.deb')
              )
            })
            if (!asset?.browser_download_url) {
              return
            }
            const appDir = join(global.Server.AppDir!, 'roadrunner', version)
            const bin = join(appDir, isWindows() ? 'rr.exe' : 'rr')
            const zip = join(global.Server.Cache!, asset.name)
            all.push({
              appDir,
              zip,
              bin,
              downloaded: existsSync(zip),
              installed: existsSync(bin),
              url: asset.browser_download_url,
              version,
              mVersion: version,
              name: `RoadRunner-${version}`
            } as OnlineVersionItem)
          })
        all.sort((a, b) => compareVersions(b.version, a.version))
        resolve(all)
      } catch (e) {
        console.log('roadrunner fetchAllOnlineVersion error: ', e)
        resolve([])
      }
    })
  }

  binVersion = (bin: string): Promise<{ version?: string; error?: string }> => {
    return new Promise(async (resolve) => {
      const cwd = dirname(bin)
      const commands = [`"${bin}" --version`, `"${bin}" version`]
      const parse = (str: string) => {
        const fixed = str.replace(new RegExp(`\r\n`, 'g'), `\n`)
        const match =
          /(?:rr|roadrunner).*?(?:version)?[^0-9v]*v?(\d+(?:\.\d+){1,3})/i.exec(fixed) ||
          /^v?(\d+(?:\.\d+){1,3})/i.exec(fixed.trim())
        return match?.[1]
      }
      let lastError: any
      for (const command of commands) {
        try {
          const res = await execPromiseWithEnv(command, {
            cwd,
            shell: undefined
          })
          console.log('roadrunner binVersion: ', command, bin, res)
          const str = `${res.stdout ?? ''}\n${res.stderr ?? ''}`
          const version = parse(str)
          if (version) {
            resolve({
              version
            })
            return
          }
        } catch (e) {
          lastError = e
        }
      }
      appDebugLog('[roadrunner][binVersion][error]', `${lastError}`).catch()
      resolve({
        error: `${lastError}`,
        version: undefined
      })
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.roadrunner?.dirs ?? [], 'rr.exe')]
      } else {
        all = [versionLocalFetch(setup?.roadrunner?.dirs ?? [], 'rr', 'roadrunner')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            return TaskQueue.run(this.binVersion, item.bin)
          })
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            const finalVersion = version || null
            const num = finalVersion
              ? Number(versionFixed(finalVersion).split('.').slice(0, 2).join(''))
              : null
            Object.assign(versions[i], {
              version: finalVersion,
              num,
              enable: !!finalVersion,
              error: finalVersion ? undefined : error
            })
          })
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    await remove(row.appDir)
    await mkdirp(row.appDir)
    await super._installSoftHandle(row)
    await moveChildDirToParent(row.appDir)
    if (!isWindows() && existsSync(row.bin)) {
      await chmod(row.bin, '0755')
    }
    if (isMacOS() && existsSync(row.bin)) {
      await binXattrFix(row.bin)
    }
  }
}

export default new RoadRunner()
