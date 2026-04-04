import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { SlimTunnel } from './SlimTunnel'
import { dirname, join } from 'path'
import { existsSync, createWriteStream } from 'fs'
import { mkdirp } from '@shared/fs-extra'
import {
  fetchPathByBin,
  binXattrFix,
  moveChildDirToParent,
  remove,
  realpathSync,
  writeFile
} from '../../Fn'
import {
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort
} from '../../util/Version'
import TaskQueue from '../../TaskQueue'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import { isMacOS, isWindows } from '@shared/utils'
import { execPromiseWithEnv } from '@shared/child-process'
import axios from 'axios'
import http from 'http'
import https from 'https'

class SlimTunnelBase extends Base {
  constructor() {
    super()
    this.type = 'slim-tunnel'
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const res = await axios({
          url: 'https://api.github.com/repos/kamranahmedse/slim/releases',
          method: 'get',
          timeout: 30000,
          withCredentials: false,
          httpAgent: new http.Agent({ keepAlive: false }),
          httpsAgent: new https.Agent({ keepAlive: false }),
          proxy: this.getAxiosProxy()
        })
        const releases: any[] = res?.data ?? []
        const list: OnlineVersionItem[] = releases
          .filter((r: any) => !r.prerelease && !r.draft && r.tag_name)
          .slice(0, 20)
          .map((r: any) => {
            const version = r.tag_name.replace(/^v/, '')
            // slim only publishes macOS and Linux binaries (no Windows builds)
            const bin = join(global.Server.AppDir!, 'slim', version, 'slim')
            const zip = join(global.Server.Cache!, `slim-${version}.tar.gz`)
            // only archive assets (exclude checksums.txt etc.)
            const archiveAssets: any[] = (r.assets ?? []).filter(
              (a: any) => a.name.endsWith('.tar.gz') || a.name.endsWith('.zip')
            )
            let url = r.html_url
            if (archiveAssets.length > 0) {
              const platform = process.platform === 'darwin' ? 'darwin' : 'linux'
              const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
              const asset =
                archiveAssets.find(
                  (a: any) => a.name.includes(platform) && a.name.includes(arch)
                ) ?? archiveAssets[0]
              url = asset.browser_download_url
            }
            return {
              url,
              version,
              mVersion: version.split('.').slice(0, 2).join('.'),
              appDir: join(global.Server.AppDir!, 'slim', version),
              bin,
              zip,
              downloaded: existsSync(zip),
              installed: existsSync(bin),
              name: `slim-${version}`
            } as OnlineVersionItem & { name: string; appDir: string }
          })
        resolve(list)
      } catch {
        resolve([])
      }
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    await remove(row.appDir)
    await mkdirp(row.appDir)
    await super._installSoftHandle(row)
    await moveChildDirToParent(row.appDir)
    if (isMacOS()) {
      try {
        await binXattrFix(row.bin)
      } catch {}
    }
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise(async (resolve) => {
      const list: SoftInstalled[] = []
      const seen = new Set<string>()

      // 1. Search well-known dirs via versionLocalFetch
      const customDirs: string[] = setup?.['slim-tunnel']?.dirs ?? []
      try {
        let localVersions: SoftInstalled[] = []
        if (isWindows()) {
          localVersions = (await versionLocalFetch(customDirs, 'slim.exe')).flat()
        } else {
          localVersions = (await versionLocalFetch(customDirs, 'slim', 'slim')).flat()
        }
        localVersions = versionFilterSame(localVersions)
        for (const v of localVersions) {
          if (!seen.has(v.bin)) {
            seen.add(v.bin)
            list.push(v)
          }
        }
      } catch {}

      // 2. Common PATH locations + which/where
      const candidates: string[] = []
      if (isWindows()) {
        const up = process.env.USERPROFILE ?? ''
        if (up) {
          candidates.push(join(up, 'AppData', 'Local', 'Programs', 'slim', 'slim.exe'))
          candidates.push(join(up, '.slim', 'bin', 'slim.exe'))
        }
        candidates.push('C:\\slim\\slim.exe')
        try {
          const r = await execPromiseWithEnv('where slim')
          const found = r?.stdout?.trim().split('\n')[0]?.trim()
          if (found) candidates.push(found)
        } catch {}
      } else {
        candidates.push('/usr/local/bin/slim', '/usr/bin/slim', '/opt/homebrew/bin/slim')
        const home = process.env.HOME ?? ''
        if (home) {
          candidates.push(join(home, '.slim', 'bin', 'slim'))
          candidates.push(join(home, 'bin', 'slim'))
        }
        try {
          const r = await execPromiseWithEnv('which slim')
          const found = r?.stdout?.trim().split('\n')[0]?.trim()
          if (found) candidates.push(found)
        } catch {}
      }

      for (const bin of candidates) {
        if (!existsSync(bin) || seen.has(bin)) continue
        seen.add(bin)
        try {
          const versionResult = await TaskQueue.run(
            versionBinVersion,
            bin,
            `"${bin}" version`,
            /(\d+\.\d+\.\d+)/
          )
          const versionStr = versionResult?.version
          if (!versionStr) continue
          const fixed = versionFixed(versionStr)
          const rawBin = realpathSync(bin)
          list.push({
            typeFlag: 'slim-tunnel' as any,
            bin: rawBin,
            path: fetchPathByBin(rawBin),
            version: fixed,
            num: Number(versionFixed(fixed).split('.').slice(0, 2).join('')),
            enable: true,
            run: false,
            running: false,
            error: versionResult?.error
          } as SoftInstalled)
        } catch {}
      }

      resolve(versionSort(list))
    })
  }

  fetchLogPath() {
    return new ForkPromise(async (resolve) => {
      const logFile = join(global.Server.BaseDir!, 'slim-tunnel', 'slim.log')
      resolve(logFile)
    })
  }

  fetchErrorLogPath() {
    return new ForkPromise(async (resolve) => {
      const logFile = join(global.Server.BaseDir!, 'slim-tunnel', 'slim-error.log')
      resolve(logFile)
    })
  }

  checkBin(item: { slimBin: string }) {
    return new ForkPromise(async (resolve) => {
      const bin = item.slimBin || 'slim'
      const command = `"${bin}" version`
      const reg = /(\d+\.\d+\.\d+)/
      const { version, error } = await versionBinVersion(bin, command, reg)
      resolve({ version: version ?? '', error: error ?? '', found: !!version })
    })
  }

  installLatest() {
    return new ForkPromise(async (resolve, reject, on) => {
      if (isWindows()) {
        reject(new Error('slim does not support Windows'))
        return
      }
      try {
        on('Fetching latest slim release...\n')
        const res = await axios({
          url: 'https://api.github.com/repos/kamranahmedse/slim/releases',
          method: 'get',
          timeout: 30000,
          withCredentials: false,
          httpAgent: new http.Agent({ keepAlive: false }),
          httpsAgent: new https.Agent({ keepAlive: false }),
          proxy: this.getAxiosProxy()
        })
        const releases: any[] = res?.data ?? []
        const latest = releases.find((r: any) => !r.prerelease && !r.draft && r.tag_name)
        if (!latest) {
          reject(new Error('No releases found'))
          return
        }
        const version = latest.tag_name.replace(/^v/, '')
        const platform = process.platform === 'darwin' ? 'darwin' : 'linux'
        const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
        const archiveAssets: any[] = (latest.assets ?? []).filter(
          (a: any) => a.name.endsWith('.tar.gz') || a.name.endsWith('.zip')
        )
        const asset =
          archiveAssets.find((a: any) => a.name.includes(platform) && a.name.includes(arch)) ??
          archiveAssets[0]
        if (!asset) {
          reject(new Error('No suitable asset found for this platform'))
          return
        }
        const appDir = join(global.Server.AppDir!, 'slim', version)
        const bin = join(appDir, 'slim')
        const zip = join(global.Server.Cache!, `slim-${version}.tar.gz`)
        const row = { url: asset.browser_download_url, zip, bin, appDir, name: `slim-${version}` }

        on(`Downloading slim ${version} for ${platform}/${arch}...\n`)
        await mkdirp(global.Server.Cache!)
        await mkdirp(global.Server.AppDir!)

        if (!existsSync(zip)) {
          await new Promise<void>((res2, rej2) => {
            axios({
              method: 'get',
              url: row.url,
              proxy: this.getAxiosProxy(),
              responseType: 'stream',
              onDownloadProgress: (progress) => {
                if (progress.total) {
                  const pct = Math.round((progress.loaded * 100.0) / progress.total)
                  on(`Downloading... ${pct}%\r`)
                }
              }
            })
              .then((response) => {
                const stream = createWriteStream(zip)
                response.data.pipe(stream)
                stream.on('finish', () => res2())
                stream.on('error', (e: any) => rej2(e))
              })
              .catch((e) => rej2(e))
          })
        }

        on('\nExtracting...\n')
        await this._installSoftHandle(row)

        on(`Done! Installed to: ${bin}\n`)
        resolve({ bin })
      } catch (e: any) {
        reject(e)
      }
    })
  }

  start(item: SlimTunnel) {
    return new ForkPromise(async (resolve, reject, on) => {
      try {
        const model = new SlimTunnel()
        Object.assign(model, item)
        await model.start((line) => on(line))
        const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
        await mkdirp(dirname(appPidFile))
        await writeFile(appPidFile, model.pid)
        resolve({ 'APP-Service-Start-PID': model.pid, publicUrl: model.publicUrl })
      } catch (e) {
        reject(e)
      }
    })
  }

  stop(item: SlimTunnel) {
    return new ForkPromise(async (resolve) => {
      try {
        const model = new SlimTunnel()
        Object.assign(model, item)
        await model.stop()
      } catch {}
      resolve(true)
    })
  }
}

export default new SlimTunnelBase()
