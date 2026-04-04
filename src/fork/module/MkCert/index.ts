import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { join, dirname } from 'path'
import { existsSync, createWriteStream } from 'fs'
import { mkdirp } from '@shared/fs-extra'
import { binXattrFix, fetchPathByBin, moveChildDirToParent, realpathSync } from '../../Fn'
import { versionBinVersion, versionFixed, versionSort } from '../../util/Version'
import TaskQueue from '../../TaskQueue'
import type { SoftInstalled } from '@shared/app'
import { isMacOS, isWindows } from '@shared/utils'
import { execPromiseWithEnv } from '@shared/child-process'
import axios from 'axios'
import http from 'http'
import https from 'https'

class MkCertBase extends Base {
  constructor() {
    super()
    this.type = 'mkcert'
  }

  /**
   * Check if mkcert binary is present and get its version.
   */
  checkBin(item: { mkcertBin: string }) {
    return new ForkPromise(async (resolve) => {
      const bin = item.mkcertBin || 'mkcert'
      const { version, error } = await versionBinVersion(
        bin,
        `"${bin}" --version`,
        /(.*?)(\d+(\.(\d+)){1,4})(.*?)/g
      )
      resolve({ version: version ?? '', error: error ?? '', found: !!version, bin })
    })
  }

  /**
   * Download and install the latest mkcert binary from GitHub.
   * Streams progress lines back to the UI.
   */
  installLatest() {
    return new ForkPromise(async (resolve, reject, on) => {
      try {
        on('Fetching latest mkcert release...\n')
        const res = await axios({
          url: 'https://api.github.com/repos/FiloSottile/mkcert/releases/latest',
          method: 'get',
          timeout: 30000,
          withCredentials: false,
          httpAgent: new http.Agent({ keepAlive: false }),
          httpsAgent: new https.Agent({ keepAlive: false }),
          proxy: this.getAxiosProxy()
        })
        const release = res?.data
        if (!release?.tag_name) {
          reject(new Error('No releases found'))
          return
        }
        const tag = release.tag_name
        const version = tag.replace(/^v/, '')

        let assetName: string
        if (isWindows()) {
          assetName = 'mkcert-v' + version + '-windows-amd64.exe'
        } else if (isMacOS()) {
          const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
          assetName = `mkcert-v${version}-darwin-${arch}`
        } else {
          const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
          assetName = `mkcert-v${version}-linux-${arch}`
        }

        const asset = (release.assets ?? []).find((a: any) => a.name === assetName)
        if (!asset) {
          reject(new Error(`No asset found for this platform: ${assetName}`))
          return
        }

        const appDir = join(global.Server.AppDir!, 'mkcert', version)
        const binName = isWindows() ? 'mkcert.exe' : 'mkcert'
        const bin = join(appDir, binName)
        const zipPath = join(global.Server.Cache!, assetName)

        on(`Downloading mkcert ${version}...\n`)
        await mkdirp(global.Server.Cache!)
        await mkdirp(appDir)

        if (!existsSync(zipPath)) {
          await new Promise<void>((res2, rej2) => {
            axios({
              method: 'get',
              url: asset.browser_download_url,
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
                const stream = createWriteStream(zipPath)
                response.data.pipe(stream)
                stream.on('finish', () => res2())
                stream.on('error', (e: any) => rej2(e))
              })
              .catch((e) => rej2(e))
          })
        }

        on('\nInstalling...\n')
        // mkcert is a single binary — just copy it to appDir
        if (assetName.endsWith('.tar.gz') || assetName.endsWith('.zip')) {
          // future-proof: handle archives
          await super._installSoftHandle({ zip: zipPath, appDir, bin })
          await moveChildDirToParent(appDir)
        } else {
          // single binary
          const { copyFile } = await import('@shared/fs-extra')
          await copyFile(zipPath, bin)
        }

        if (!isWindows()) {
          try {
            await execPromiseWithEnv(`chmod +x "${bin}"`)
          } catch {}
        }
        if (isMacOS()) {
          try {
            await binXattrFix(bin)
          } catch {}
        }

        on(`Done! Installed to: ${bin}\n`)
        resolve({ bin })
      } catch (e: any) {
        reject(e)
      }
    })
  }

  /**
   * Run `mkcert -install` to add the local CA to the system trust store.
   */
  installCA(item: { mkcertBin: string }) {
    return new ForkPromise(async (resolve, reject, on) => {
      const bin = item.mkcertBin || 'mkcert'
      try {
        on('Installing local CA into system trust store...\n')
        const { execPromiseWithEnv: exec } = await import('@shared/child-process')
        const result = await exec(`"${bin}" -install`)
        on(result.stdout ?? '')
        if (result.stderr) on(result.stderr)
        on('Done!\n')
        resolve(true)
      } catch (e: any) {
        reject(e)
      }
    })
  }

  /**
   * Returns the path where mkcert stores the root CA files.
   */
  getCAROOT(item: { mkcertBin: string }) {
    return new ForkPromise(async (resolve) => {
      const bin = item.mkcertBin || 'mkcert'
      try {
        const { execPromiseWithEnv: exec } = await import('@shared/child-process')
        const result = await exec(`"${bin}" -CAROOT`)
        resolve({ caroot: result.stdout?.trim() ?? '' })
      } catch {
        resolve({ caroot: '' })
      }
    })
  }

  /**
   * Generate a certificate for the given host names, placing cert+key at the
   * paths already configured in the host's ssl object.
   */
  generateCert(item: { mkcertBin: string; certFile: string; keyFile: string; domains: string[] }) {
    return new ForkPromise(async (resolve, reject, on) => {
      const bin = item.mkcertBin || 'mkcert'
      const certDir = join(dirname(item.certFile))

      try {
        await mkdirp(certDir)
        const domainArgs = item.domains.map((d) => `"${d}"`).join(' ')
        const cmd = `"${bin}" -cert-file "${item.certFile}" -key-file "${item.keyFile}" ${domainArgs}`
        on(`Running: ${cmd}\n`)

        const { execPromiseWithEnv: exec } = await import('@shared/child-process')
        const result = await exec(cmd)
        on(result.stdout ?? '')
        if (result.stderr) on(result.stderr)
        resolve(true)
      } catch (e: any) {
        reject(e)
      }
    })
  }

  allInstalledVersions() {
    return new ForkPromise(async (resolve) => {
      const list: SoftInstalled[] = []
      const seen = new Set<string>()

      const candidates: string[] = []
      if (isWindows()) {
        const up = process.env.USERPROFILE ?? ''
        if (up) {
          candidates.push(join(up, 'AppData', 'Local', 'Programs', 'mkcert', 'mkcert.exe'))
        }
        try {
          const r = await execPromiseWithEnv('where mkcert')
          const found = r?.stdout?.trim().split('\n')[0]?.trim()
          if (found) candidates.push(found)
        } catch {}
      } else {
        candidates.push('/usr/local/bin/mkcert', '/usr/bin/mkcert', '/opt/homebrew/bin/mkcert')
        const home = process.env.HOME ?? ''
        if (home) candidates.push(join(home, 'bin', 'mkcert'))
        try {
          const r = await execPromiseWithEnv('which mkcert')
          const found = r?.stdout?.trim().split('\n')[0]?.trim()
          if (found) candidates.push(found)
        } catch {}
      }

      // scan app-managed installs
      const appMkcertDir = join(global.Server.AppDir!, 'mkcert')
      if (existsSync(appMkcertDir)) {
        const { readdirSync } = await import('fs')
        for (const ver of readdirSync(appMkcertDir)) {
          const b = join(appMkcertDir, ver, isWindows() ? 'mkcert.exe' : 'mkcert')
          if (existsSync(b)) candidates.push(b)
        }
      }

      for (const bin of candidates) {
        if (!existsSync(bin) || seen.has(bin)) continue
        seen.add(bin)
        try {
          const versionResult = await TaskQueue.run(
            versionBinVersion,
            bin,
            `"${bin}" --version`,
            /(.*?)(\d+(\.(\d+)){1,4})(.*?)/g
          )
          const versionStr = versionResult?.version
          if (!versionStr) continue
          const fixed = versionFixed(versionStr)
          const rawBin = realpathSync(bin)
          list.push({
            typeFlag: 'mkcert' as any,
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
}

export default new MkCertBase()
