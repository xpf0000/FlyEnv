import { Base } from './Base'
import {
  execPromise,
  fetchPathByBin,
  moveChildDirToParent,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionSort,
  mkdirp,
  readdir,
  remove,
  realpath,
  zipUnPack,
  execPromiseWithEnv,
  fetchRawPATH,
  versionLocalFetch
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { dirname, join } from 'path'
import { compareVersions } from 'compare-versions'
import { createWriteStream, existsSync } from 'fs'
import axios from 'axios'
import type { SoftInstalled } from '@shared/app'
import TaskQueue from '../TaskQueue'
import ncu from 'npm-check-updates'

class Manager extends Base {
  constructor() {
    super()
  }

  _initNVM(): Promise<string> {
    return new Promise(async (resolve) => {
      let NVM_HOME = ''
      try {
        const command = `set NVM_HOME`
        const res = await execPromise(command)
        NVM_HOME = res?.stdout?.trim()?.replace('NVM_HOME=', '').trim()
      } catch {}
      if (NVM_HOME && existsSync(NVM_HOME) && existsSync(join(NVM_HOME, 'nvm.exe'))) {
        console.log('NVM_HOME 0: ', NVM_HOME)
        resolve(NVM_HOME)
        return
      }

      try {
        const command = `powershell.exe -command "$env:NVM_HOME"`
        const res = await execPromise(command)
        NVM_HOME = res?.stdout?.trim()?.replace('NVM_HOME=', '').trim()
      } catch {}
      if (NVM_HOME && existsSync(NVM_HOME) && existsSync(join(NVM_HOME, 'nvm.exe'))) {
        console.log('NVM_HOME 1: ', NVM_HOME)
        resolve(NVM_HOME)
        return
      }
      resolve(NVM_HOME)
    })
  }

  _initFNM(): Promise<string> {
    return new Promise(async (resolve) => {
      let FNM_HOME = ''
      try {
        const command = `set FNM_HOME`
        const res = await execPromise(command)
        FNM_HOME = res?.stdout?.trim()?.replace('FNM_HOME=', '').trim()
      } catch {}
      if (FNM_HOME && existsSync(FNM_HOME) && existsSync(join(FNM_HOME, 'fnm.exe'))) {
        console.log('FNM_HOME 0: ', FNM_HOME)
        resolve(FNM_HOME)
        return
      }

      try {
        const command = `powershell.exe -command "$env:FNM_HOME"`
        const res = await execPromise(command)
        FNM_HOME = res?.stdout?.trim()?.replace('FNM_HOME=', '').trim()
      } catch {}
      if (FNM_HOME && existsSync(FNM_HOME) && existsSync(join(FNM_HOME, 'fnm.exe'))) {
        console.log('FNM_HOME 1: ', FNM_HOME)
        resolve(FNM_HOME)
        return
      }

      resolve(FNM_HOME)
    })
  }
  allVersion(tool: 'fnm' | 'nvm') {
    return new ForkPromise(async (resolve) => {
      const url = 'https://nodejs.org/dist/'
      const res = await axios({
        method: 'get',
        url: url
      })
      // console.log('res: ', res)
      const html = res.data
      const regex = /href="v([\d\\.]+?)\/"/g
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
        all: links,
        tool
      })
    })
  }

  async _buildEnv(tool: 'fnm' | 'nvm', dir: string) {
    let allPath: string[] = []
    try {
      allPath = await fetchRawPATH()
    } catch {
      return
    }
    const env: any = {}
    if (tool === 'fnm') {
      env.FNM_HOME = dir
      env.FNM_SYMLINK = join(dir, 'nodejs-link')
      if (!allPath.includes('%FNM_HOME%')) {
        allPath.push('%FNM_HOME%')
      }
      allPath.push(dir)
    } else {
      env.NVM_HOME = dir
      env.NVM_SYMLINK = join(dir, 'nodejs-link')
      if (!allPath.includes('%NVM_HOME%')) {
        allPath.push('%NVM_HOME%')
      }
      allPath.push(dir)
    }
    env.PATH = allPath.join(';')
    return env
  }

  localVersion(tool: 'fnm' | 'nvm' | 'default') {
    return new ForkPromise(async (resolve) => {
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
          .filter((s: string) => s.startsWith('v') && existsSync(join(dir, s, 'node.exe')))
          .map((s: string) => s.replace('v', '').trim())
        const envDir = join(dirname(global.Server.AppDir!), 'env')
        const currentDir = join(envDir, 'node')
        let current = ''
        if (existsSync(currentDir) && existsSync(join(currentDir, 'node.exe'))) {
          const realDir = await realpath(currentDir)
          process.chdir(realDir)
          const res = await execPromise(`node.exe -v`)
          current = res?.stdout?.trim()?.replace('v', '') ?? ''
        }
        versions.sort((a: string, b: string) => {
          return compareVersions(b, a)
        })
        return resolve({
          versions,
          current,
          tool
        })
      }

      let dir = ''
      if (tool === 'fnm') {
        dir = await this._initFNM()
      } else {
        dir = await this._initNVM()
      }
      if (!dir || !existsSync(dir)) {
        resolve({
          versions: [],
          current: '',
          tool
        })
      }
      console.log('localVersion: ', dir, existsSync(dir))
      const env = await this._buildEnv(tool, dir)
      let res: any
      process.chdir(dir)
      try {
        res = await execPromise(`${tool}.exe ls`, {
          cwd: dir,
          env
        })
        console.log('localVersion: ', res)
      } catch (e) {
        console.log('localVersion err: ', e)
        resolve({
          versions: [],
          current: '',
          tool
        })
        return
      }
      const stdout = res?.stdout?.trim() ?? ''
      if (!stdout) {
        resolve({
          versions: [],
          current: '',
          tool
        })
        return
      }
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
        const ls = str.split(' (Currently using')[0]
        localVersions = ls.match(/\d+(\.\d+){1,4}/g) ?? []
        const reg = /(\d+(\.\d+){1,4}) \(Currently using/g
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
    })
  }

  versionChange(tool: 'fnm' | 'nvm', select: string) {
    return new ForkPromise(async (resolve, reject) => {
      let dir = ''
      if (tool === 'fnm') {
        dir = await this._initFNM()
      } else {
        dir = await this._initNVM()
      }
      if (!dir) {
        reject(new Error(`${tool} not found`))
        return
      }
      let command = ''
      if (tool === 'fnm') {
        command = `fnm.exe default ${select}`
      } else {
        command = `nvm.exe use ${select}`
      }
      const env = await this._buildEnv(tool, dir)
      process.chdir(dir)
      try {
        await execPromise(command, {
          cwd: dir,
          env
        })
        const { current }: any = await this.localVersion(tool)
        if (current !== select) {
          return reject(new Error('Fail'))
        }
      } catch (e) {
        console.log('versionChange error: ', e)
        return reject(e)
      }
      resolve(true)
    })
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
          const url = `https://nodejs.org/dist/v${version}/node-v${version}-win-x64.7z`
          const destDir = join(global.Server.AppDir!, `nodejs/v${version}`)
          if (existsSync(destDir)) {
            try {
              await remove(destDir)
            } catch {}
          }
          await mkdirp(destDir)

          const zip = join(global.Server.Cache!, `node-v${version}.7z`)

          const unpack = async () => {
            try {
              await zipUnPack(zip, destDir)
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
      let dir = ''
      if (tool === 'fnm') {
        dir = await this._initFNM()
      } else {
        dir = await this._initNVM()
      }
      if (!dir) {
        reject(new Error(`${tool} not found`))
        return
      }

      let command = ''
      if (tool === 'fnm') {
        command = `fnm.exe ${action} ${version}`
      } else {
        command = `nvm.exe ${action} ${version}`
      }
      const env = await this._buildEnv(tool, dir)
      process.chdir(dir)
      try {
        await execPromise(command, {
          cwd: dir,
          env
        })
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
        fnmDir = (
          await execPromiseWithEnv(`echo %FNM_DIR%`, {
            shell: 'cmd.exe'
          })
        ).stdout.trim()
        if (fnmDir === '%FNM_DIR%') {
          fnmDir = ''
        }
      } catch {}
      if (!fnmDir) {
        try {
          fnmDir = (
            await execPromiseWithEnv(`$env:FNM_DIR`, {
              shell: 'powershell.exe'
            })
          ).stdout.trim()
        } catch {}
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
              (f) => f.startsWith('v') && existsSync(join(fnmDir, f, 'installation/node.exe'))
            )
            .map((f) => {
              const version = f.replace('v', '')
              const bin = join(fnmDir, f, 'installation/node.exe')
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
        nvmDir = (
          await execPromiseWithEnv(`nvm root`, {
            shell: 'cmd.exe'
          })
        ).stdout
          .trim()
          .replace('Current Root: ', '')
      } catch {}
      if (!nvmDir) {
        try {
          nvmDir = (
            await execPromiseWithEnv(`nvm root`, {
              shell: 'powershell.exe'
            })
          ).stdout
            .trim()
            .replace('Current Root: ', '')
        } catch {}
      }
      if (nvmDir && existsSync(nvmDir)) {
        if (existsSync(nvmDir)) {
          let allNVM: any[] = []
          try {
            allNVM = await readdir(nvmDir)
          } catch {}
          allNVM = allNVM
            .filter((f) => f.startsWith('v') && existsSync(join(nvmDir, f, 'node.exe')))
            .map((f) => {
              const version = f.replace('v', '')
              const bin = join(nvmDir, f, 'node.exe')
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
      Promise.all([versionLocalFetch(dir, 'node.exe')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          console.log('versions: ', versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" -v`
            const reg = /(v)(\d+(\.\d+){1,4})(.*?)$/gm
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
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
              if (!versions.some((v) => v.bin === item.bin)) {
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
              }
            })
          } catch {}
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
        .then((res: any) => {
          resolve(res)
        })
        .catch((e: any) => {
          reject(e)
        })
    })
  }
}

export default new Manager()
