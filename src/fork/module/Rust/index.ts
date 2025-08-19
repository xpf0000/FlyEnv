import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  brewInfoJson,
  execPromise,
  mkdirp,
  moveChildDirToParent,
  readdir,
  readFile,
  remove,
  uuid,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  zipUnpack
} from '../../Fn'
import TaskQueue from '../../TaskQueue'
import { join } from 'path'
import { existsSync } from 'fs'
import { isWindows } from '@shared/utils'
import { homedir, tmpdir } from 'node:os'

class Rust extends Base {
  constructor() {
    super()
    this.type = 'rust'
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('rust')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isWindows()) {
            dir = join(global.Server.AppDir!, `rust`, a.version, 'cargo/bin/cargo.exe')
            zip = join(global.Server.Cache!, `rust-${a.version}.tar.xz`)
            a.appDir = join(global.Server.AppDir!, `rust`, a.version)
          } else {
            dir = join(global.Server.AppDir!, `rust-${a.version}`, 'bin/cargo')
            zip = join(global.Server.Cache!, `rust-${a.version}.tar.xz`)
            a.appDir = join(global.Server.AppDir!, `rust-${a.version}`)
          }

          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `Rust-${a.version}`
        })
        resolve(all)
      } catch {
        resolve({})
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch([...(setup?.rust?.dirs ?? [])], 'cargo.exe')]
      } else {
        all = [versionLocalFetch([...(setup?.rust?.dirs ?? [])], 'cargo', 'rust')]
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
              /(cargo )(\d+(\.\d+){1,4})(.*?)/g
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
            if (isWindows()) {
              item.path = join(item.path, '../')
            } else {
              if (item.path.includes(global.Server.AppDir!)) {
                const p = join(item.path, '../bin/cargo')
                if (existsSync(p)) {
                  item.path = join(p, '../../')
                }
              }
            }

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
    if (isWindows()) {
      await remove(row.appDir)
      await mkdirp(row.appDir)
      const cacheDir = join(global.Server.Cache!, uuid())
      await mkdirp(cacheDir)
      await zipUnpack(row.zip, cacheDir)
      const files = await readdir(cacheDir)
      const find = files.find((f) => f.includes('.tar'))
      if (!find) {
        throw new Error('UnZIP failed')
      }
      await zipUnpack(join(cacheDir, find), row.appDir)
      await moveChildDirToParent(row.appDir)
      await remove(cacheDir)
    } else {
      const dir = row.appDir
      await super._installSoftHandle(row)
      await moveChildDirToParent(dir)
      const installSH = join(row.appDir, 'install.sh')
      await execPromise(`${installSH} --destdir="./" --prefix="/"`)
    }
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const all: Array<string> = ['rust']
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }

  checkRustup() {
    return new ForkPromise(async (resolve) => {
      let rustupBin = join(homedir(), '.cargo/bin/rustup')
      if (isWindows()) {
        rustupBin = join(homedir(), '.cargo/bin/rustup.exe')
      }
      resolve(existsSync(rustupBin))
    })
  }

  rustupData() {
    return new ForkPromise(async (resolve) => {
      let rustupBin = join(homedir(), '.cargo/bin/rustup')
      if (isWindows()) {
        rustupBin = join(homedir(), '.cargo/bin/rustup.exe')
      }
      const toolchainDir = join(homedir(), '.rustup/toolchains')

      const toolchainList: any = []
      const tmplDir = join(tmpdir(), uuid())
      await mkdirp(tmplDir)
      const tmplFile = join(tmplDir, `${uuid()}.txt`)
      try {
        await execPromise(`"${rustupBin}" toolchain list > "${tmplFile}"`)
        const content = await readFile(tmplFile, 'utf-8')
        if (content) {
          const list = content.split('\n').filter((f) => !!f.trim())
          for (const v of list) {
            const dir = v.split(' ').shift()!
            const versionFile = join(tmplDir, `${uuid()}.txt`)
            const versionDir = join(toolchainDir, dir)
            let versionBin = join(toolchainDir, dir, 'bin/cargo')
            if (isWindows()) {
              versionBin = join(toolchainDir, dir, 'bin/cargo.exe')
            }
            if (existsSync(versionBin)) {
              await execPromise(`"${versionBin}" version > "${versionFile}"`)
            }
            const vContent = await readFile(versionFile, 'utf-8')
            const version = vContent.split(' ')?.[1]
            const name = dir.split('-').shift()
            if (version && name) {
              toolchainList.push({
                path: versionDir,
                name,
                version,
                isDefault: v.includes('(active, default)')
              })
            }
          }
        }
      } catch {}

      const targetList = []
      const tmplFile1 = join(tmplDir, `${uuid()}.txt`)
      try {
        await execPromise(`"${rustupBin}" target list > "${tmplFile1}"`)
        const content = await readFile(tmplFile1, 'utf-8')
        if (content) {
          const list = content.split('\n').filter((f) => !!f.trim())
          for (const v of list) {
            const name = v.split(' ').shift()!
            targetList.push({
              name,
              installed: v.includes('(installed)')
            })
          }
        }
      } catch {}

      setTimeout(() => {
        remove(tmplDir).catch()
      }, 2000)

      resolve({
        toolchainList,
        targetList
      })
    })
  }
}
export default new Rust()
