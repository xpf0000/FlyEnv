import { Base } from '../Base'
import {
  execPromise,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  readdir,
  realpath,
  remove,
  mkdirp,
  fetchPathByBin,
  moveChildDirToParent,
  execPromiseWithEnv
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { basename, dirname, join } from 'path'
import { compareVersions } from '@shared/compare-versions'
import { createWriteStream, existsSync } from 'fs'
import axios from 'axios'
import type { SoftInstalled } from '@shared/app'
import TaskQueue from '../../TaskQueue'
import ncu from 'npm-check-updates'
import { appDebugLog, isMacOS } from '@shared/utils'
import { unpack as unpackZip } from '../../util/Zip'
import EnvSync from '@shared/EnvSync'

class Manager extends Base {
  constructor() {
    super()
  }

  /**
   * Check if fnm or nvm is installed
   */
  checkInstalled(tool: 'fnm' | 'nvm') {
    return new ForkPromise(async (resolve) => {
      let installed = false
      let version = ''
      try {
        const command =
          tool === 'fnm'
            ? 'fnm --version'
            : 'unset PREFIX && source "$NVM_DIR/nvm.sh" && nvm --version'
        const res = await execPromiseWithEnv(command)
        version = res?.stdout?.trim() ?? ''
        installed = version.length > 0 && /[\d.]+/.test(version)
      } catch (e) {
        console.log(`${tool} --version error: `, e)
        installed = false
        version = ''
      }
      resolve({
        installed,
        version
      })
    })
  }

  allVersion() {
    return new ForkPromise(async (resolve) => {
      const url = 'https://nodejs.org/dist/'
      const res = await axios({
        method: 'get',
        url: url,
        proxy: this.getAxiosProxy()
      })
      const html = res.data
      const regex = /href="v([\d.]+?)\/"/g
      let result
      let links = []
      while ((result = regex.exec(html)) != null) {
        links.push(result[1].trim())
      }
      console.log('links: ', links)
      links = links
        .filter((s) => Number(s.split('.')[0]) > 7)
        .sort((a, b) => {
          return compareVersions(b, a)
        })
      console.log('links: ', links)
      resolve({
        all: links
      })
    })
  }

  localVersion(tool: 'fnm' | 'nvm' | 'default') {
    return new ForkPromise(async (resolve, reject) => {
      if (tool === 'default') {
        const dir = join(global.Server.AppDir!, 'nodejs')
        if (!existsSync(dir)) {
          return resolve({
            versions: [],
            current: '',
            tool
          })
        }
        const dirs = await readdir(dir)
        const versions = dirs
          .filter((s) => s.startsWith('v') && existsSync(join(dir, s, 'bin/node')))
          .map((s) => s.replace('v', '').trim())
        const envDir = join(dirname(global.Server.AppDir!), 'env')
        const currentDir = join(envDir, 'node')
        let current = ''
        if (existsSync(currentDir) && existsSync(join(currentDir, 'node'))) {
          const realDir = await realpath(currentDir)
          const folder = basename(dirname(realDir))
          if (folder.startsWith('v')) {
            current = folder.replace('v', '').trim()
          }
        }
        versions.sort((a, b) => {
          return compareVersions(b, a)
        })
        return resolve({
          versions,
          current,
          tool
        })
      }
      let command = ''
      if (tool === 'fnm') {
        command = 'unset PREFIX;fnm ls'
      } else {
        command = 'unset PREFIX;[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";nvm ls'
      }
      try {
        const res = await execPromiseWithEnv(command)
        const stdout = res?.stdout ?? ''
        let localVersions: Array<string> = []
        let current = ''
        if (tool === 'fnm') {
          localVersions = stdout.match(/\d+(\.\d+){1,4}/g) ?? []
          const regex = /(\d+(\.\d+){1,4}) default/g
          const arr = regex.exec(stdout)
          if (arr && arr.length > 1) {
            current = arr[1]
          }
        } else {
          const str = stdout
          const ls = str.split('default')[0]
          localVersions = ls.match(/\d+(\.\d+){1,4}/g) ?? []
          const reg = /default.*?(\d+(\.\d+){1,4}).*?\(/g
          const currentArr: any = reg.exec(str)
          if (currentArr?.length > 1) {
            current = currentArr[1]
          } else {
            current = ''
          }
        }
        localVersions?.sort((a, b) => {
          return compareVersions(b, a)
        })
        resolve({
          versions: localVersions,
          current: current,
          tool
        })
      } catch (e) {
        reject(e)
      }
    })
  }

  /**
   * Get install/uninstall command for XTerm execution
   */
  getInstallCommand(tool: 'fnm' | 'nvm', action: 'install' | 'uninstall', version: string) {
    if (tool === 'fnm') {
      return `unset PREFIX;fnm ${action} ${version}`
    } else {
      return `unset PREFIX;export NVM_DIR="\${HOME}/.nvm";[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";nvm ${action} ${version}`
    }
  }

  installOrUninstall(
    tool: 'fnm' | 'nvm' | 'default',
    action: 'install' | 'uninstall',
    version: string
  ) {
    return new ForkPromise(async (resolve, reject, on) => {
      if (tool === 'default') {
        if (action === 'uninstall') {
          const dir = join(global.Server.AppDir!, `nodejs/v${version}`)
          if (existsSync(dir)) {
            try {
              await remove(dir)
            } catch (e) {
              return reject(e)
            }
          }
          const { versions, current }: { versions: Array<string>; current: string } =
            (await this.localVersion(tool)) as any
          resolve({
            versions,
            current
          })
        } else {
          const arch = global.Server.isArmArch ? 'arm64' : 'x64'
          const os = isMacOS() ? 'darwin' : 'linux'
          const url = `https://nodejs.org/dist/v${version}/node-v${version}-${os}-${arch}.tar.xz`
          const destDir = join(global.Server.AppDir!, `nodejs/v${version}`)
          if (existsSync(destDir)) {
            try {
              await remove(destDir)
            } catch {}
          }
          await mkdirp(destDir)

          const zip = join(global.Server.Cache!, `node-v${version}.tar.xz`)

          const unpack = async () => {
            try {
              await unpackZip(zip, destDir)
              await moveChildDirToParent(destDir)
            } catch (e) {
              return e
            }
            return true
          }

          const end = async () => {
            const res = await unpack()
            if (res === true) {
              const { versions, current }: { versions: Array<string>; current: string } =
                (await this.localVersion(tool)) as any
              const envDir = join(dirname(global.Server.AppDir!), 'env')
              const currentDir = join(envDir, 'node')
              resolve({
                versions,
                current,
                setEnv: !existsSync(currentDir)
              })
              return true
            }
            return res
          }

          if (existsSync(zip)) {
            if ((await end()) === true) {
              return
            }
            await remove(zip)
          }

          const fail = async () => {
            try {
              await remove(zip)
              await remove(destDir)
            } catch {}
          }

          axios({
            method: 'get',
            url: url,
            proxy: this.getAxiosProxy(),
            responseType: 'stream',
            onDownloadProgress: (progress) => {
              if (progress.total) {
                const num = Math.round((progress.loaded * 100.0) / progress.total)
                on({
                  progress: num
                })
              }
            }
          })
            .then(function (response) {
              const stream = createWriteStream(zip)
              response.data.pipe(stream)
              stream.on('error', async (err: any) => {
                console.log('stream error: ', err)
                await fail()
                reject(err)
              })
              stream.on('finish', async () => {
                const res = await end()
                if (res === true) {
                  return
                }
                reject(res)
              })
            })
            .catch(async (err) => {
              console.log('down error: ', err)
              await fail()
              reject(err)
            })
        }
        return
      }
      const command = this.getInstallCommand(tool, action, version)
      try {
        await execPromise(command)
        const { versions, current }: { versions: Array<string>; current: string } =
          (await this.localVersion(tool)) as any
        if (
          (action === 'install' && versions.includes(version)) ||
          (action === 'uninstall' && !versions.includes(version))
        ) {
          resolve({
            versions,
            current
          })
        } else {
          reject(new Error('Fail'))
        }
      } catch (e) {
        reject(e)
      }
    })
  }

  allInstalled(): ForkPromise<
    Array<{
      version: string
      bin: string
    }>
  > {
    return new ForkPromise(async (resolve) => {
      const all: any[] = []
      let fnmDir = ''
      try {
        fnmDir = (await execPromiseWithEnv(`echo $FNM_DIR`)).stdout.trim()
      } catch (e) {
        appDebugLog(`[allInstalled][$FNM_DIR][error]`, `${e}`).catch()
      }
      if (!fnmDir) {
        try {
          const res = await execPromiseWithEnv('fnm env')
          fnmDir =
            res?.stdout
              ?.trim()
              ?.split('\n')
              ?.find((l) => l.includes('export FNM_DIR'))
              ?.split('=')?.[1]
              ?.replace(/"/g, '') ?? ''
        } catch (e) {
          appDebugLog(`[allInstalled][fnm env][error]`, `${e}`).catch()
          appDebugLog(
            `[allInstalled][fnm env][AppEnv]`,
            JSON.stringify(EnvSync.AppEnv, null, 2)
          ).catch()
        }
      }
      if (fnmDir && existsSync(fnmDir)) {
        fnmDir = join(fnmDir, 'node-versions')
        if (existsSync(fnmDir)) {
          let allFnm: any[] = []
          try {
            allFnm = await readdir(fnmDir)
          } catch {}
          allFnm = allFnm
            .filter(
              (f) => f.startsWith('v') && existsSync(join(fnmDir, f, 'installation/bin/node'))
            )
            .map((f) => {
              const version = f.replace('v', '')
              const bin = join(fnmDir, f, 'installation/bin/node')
              return {
                version,
                bin
              }
            })
          all.push(...allFnm)
        }
      }

      let nvmDir = ''
      try {
        nvmDir = (await execPromiseWithEnv(`echo $NVM_DIR`)).stdout.trim()
      } catch {}
      if (nvmDir && existsSync(nvmDir)) {
        nvmDir = join(nvmDir, 'versions/node')
        if (existsSync(nvmDir)) {
          let allNVM: any[] = []
          try {
            allNVM = await readdir(nvmDir)
          } catch {}
          allNVM = allNVM
            .filter((f) => f.startsWith('v') && existsSync(join(nvmDir, f, 'bin/node')))
            .map((f) => {
              const version = f.replace('v', '')
              const bin = join(nvmDir, f, 'bin/node')
              return {
                version,
                bin
              }
            })
          all.push(...allNVM)
        }
      }
      resolve(all)
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      const dir = [...(setup?.node?.dirs ?? [])]
      Promise.all([versionLocalFetch(dir, 'node', 'node')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) =>
            TaskQueue.run(
              versionBinVersion,
              item.bin,
              `./${basename(item.bin)} -v`,
              /(v)(\d+(\.\d+){1,4})(.*?)$/gm
            )
          )
          if (all.length === 0) {
            return Promise.resolve([])
          }
          return Promise.all(all)
        })
        .then(async (list) => {
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
          try {
            const fnmvnmVersions = await this.allInstalled()
            fnmvnmVersions.forEach((item) => {
              const path = fetchPathByBin(item.bin)
              const num = item.version
                ? Number(versionFixed(item.version).split('.').slice(0, 2).join(''))
                : null
              versions.push({
                run: false,
                running: false,
                typeFlag: 'node',
                path,
                bin: item.bin,
                version: item.version,
                num,
                enable: true
              })
            })
          } catch {}
          versions = versionFilterSame(versions)
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }

  packageJsonUpdate(file: string, cwd?: string) {
    return new ForkPromise((resolve, reject) => {
      ncu({
        packageFile: file,
        cwd
      })
        .then((res) => {
          resolve(res)
        })
        .catch((e) => {
          reject(e)
        })
    })
  }
}

export default new Manager()
