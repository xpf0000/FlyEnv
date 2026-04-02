import { ForkPromise } from '@shared/ForkPromise'
import axios from 'axios'
import http from 'http'
import https from 'https'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import { isWindows } from '@shared/utils'
import { join } from 'path'
import { execPromiseWithEnv } from '@shared/child-process'
import { existsSync } from 'fs'
import TaskQueue from '../../TaskQueue'
import { versionBinVersion, versionFixed, versionSort } from '../../util/Version'
import { fetchPathByBin, realpathSync } from '../../Fn'
import { basename } from 'node:path'

export function fetchAllOnlineVersion(this: any) {
  return new ForkPromise(async (resolve) => {
    try {
      const res = await axios({
        url: 'https://registry.npmjs.org/n8n',
        method: 'get',
        timeout: 30000,
        withCredentials: false,
        httpAgent: new http.Agent({ keepAlive: false }),
        httpsAgent: new https.Agent({ keepAlive: false }),
        proxy: this.getAxiosProxy()
      })
      const allVersions: string[] = Object.keys(res?.data?.versions ?? {})
      // Keep last 20 stable versions (exclude beta/alpha/rc)
      const stable = allVersions
        .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
        .sort((a, b) => {
          const ap = a.split('.').map(Number)
          const bp = b.split('.').map(Number)
          for (let i = 0; i < 3; i++) {
            if ((bp[i] ?? 0) !== (ap[i] ?? 0)) return (bp[i] ?? 0) - (ap[i] ?? 0)
          }
          return 0
        })
        .slice(0, 20)

      const list: OnlineVersionItem[] = stable.map((v) => ({
        url: `https://www.npmjs.com/package/n8n/v/${v}`,
        version: v,
        mVersion: v.split('.').slice(0, 2).join('.')
      }))
      resolve(list)
    } catch (e) {
      console.log('n8n fetchAllOnlineVersion err:', e)
      resolve([])
    }
  })
}

export function allInstalledVersions(this: any) {
  return new ForkPromise(async (resolve) => {
    const list: SoftInstalled[] = []
    const seen = new Set<string>()

    const candidates: string[] = []

    if (isWindows()) {
      const appData = process.env.APPDATA ?? ''
      const userProfile = process.env.USERPROFILE ?? ''
      if (appData) candidates.push(join(appData, 'npm', 'n8n.cmd'))
      if (userProfile) candidates.push(join(userProfile, 'AppData', 'Roaming', 'npm', 'n8n.cmd'))
    } else {
      candidates.push('/usr/local/bin/n8n')
      candidates.push('/usr/bin/n8n')
      candidates.push('/opt/homebrew/bin/n8n')
      const home = process.env.HOME ?? ''
      if (home) {
        candidates.push(join(home, '.npm-global', 'bin', 'n8n'))
        candidates.push(join(home, '.yarn', 'bin', 'n8n'))
        candidates.push(join(home, '.volta', 'bin', 'n8n'))
        candidates.push(join(home, '.nvm', 'default', 'bin', 'n8n'))
      }
    }

    // PATH lookup
    try {
      const cmd = isWindows() ? 'where n8n' : 'which n8n'
      const result = await execPromiseWithEnv(cmd)
      const found = result?.stdout?.trim().split('\n')[0]?.trim()
      if (found && !candidates.includes(found)) {
        candidates.push(found)
      }
    } catch {}

    for (const bin of candidates) {
      if (!existsSync(bin) || seen.has(bin)) continue
      seen.add(bin)
      try {
        const versionResult = await TaskQueue.run(
          versionBinVersion,
          bin,
          `"${bin}" --version`,
          /(.*?)(\d+(\.\d+){1,4})(.*?)/g
        )
        const versionStr = versionResult?.version
        if (!versionStr) continue
        const fixed = versionFixed(versionStr)
        let rawBin = realpathSync(bin)
        if (isWindows() && basename(rawBin) === 'n8n') {
          rawBin += '.cmd'
        }
        list.push({
          typeFlag: 'n8n',
          bin: rawBin,
          path: fetchPathByBin(rawBin),
          version: fixed,
          num: parseFloat(fixed),
          enable: true,
          run: false,
          running: false
        } as SoftInstalled)
      } catch {}
    }

    resolve(versionSort(list))
  })
}
