import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { join } from 'path'
import { existsSync } from 'fs'
import { chmod, copyFile, mkdirp, remove } from '@shared/fs-extra'
import { binXattrFix, brewInfoJson, versionFilterSame, versionLocalFetch } from '../../Fn'
import { versionBinVersion, versionFixed, versionSort } from '../../util/Version'
import TaskQueue from '../../TaskQueue'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import { isMacOS, isWindows } from '@shared/utils'
import { execPromiseWithEnv } from '@shared/child-process'

class MkCertBase extends Base {
  constructor() {
    super()
    this.type = 'mkcert'
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('mkcert')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isWindows()) {
            dir = join(global.Server.AppDir!, `mkcert`, a.version, 'mkcert.exe')
            zip = join(global.Server.Cache!, `mkcert-${a.version}`)
            a.appDir = join(global.Server.AppDir!, `mkcert`, a.version)
          } else {
            dir = join(global.Server.AppDir!, `mkcert`, a.version, 'mkcert')
            zip = join(global.Server.Cache!, `mkcert-${a.version}`)
            a.appDir = join(global.Server.AppDir!, `mkcert`, a.version)
          }

          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `mkcert-${a.version}`
        })
        resolve(all)
      } catch {
        resolve({})
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise(async (resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      const customDirs = [...(setup?.mkcert?.dirs ?? [])]
      if (isWindows()) {
        all = [versionLocalFetch(customDirs, 'mkcert.exe')]
      } else {
        all = [versionLocalFetch(customDirs, 'mkcert', 'mkcert')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) =>
            TaskQueue.run(
              versionBinVersion,
              item.bin,
              `"${item.bin}" --version`,
              /(v)(\d+(\.\d+){1,4})(.*?)/g
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
            const item = versions[i]

            Object.assign(item, {
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

  async _installSoftHandle(row: any): Promise<void> {
    await remove(row.appDir)
    await mkdirp(row.appDir)
    await copyFile(row.zip, row.bin)

    if (isMacOS()) {
      try {
        await binXattrFix(row.bin)
      } catch {}
    }
    if (!isWindows()) {
      await chmod(row.bin, '0755')
    }
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const all: Array<string> = ['mkcert']
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
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
        const result = await execPromiseWithEnv(`"${bin}" -CAROOT`)
        resolve({ caroot: result.stdout?.trim() ?? '' })
      } catch {
        resolve({ caroot: '' })
      }
    })
  }
}

export default new MkCertBase()
