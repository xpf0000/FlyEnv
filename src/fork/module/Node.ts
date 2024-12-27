import { Base } from './Base'
import { execPromiseRoot } from '../Fn'
import { exec } from 'child-process-promise'
import { ForkPromise } from '@shared/ForkPromise'
import { dirname, join } from 'path'
import { compareVersions } from 'compare-versions'
import { existsSync } from 'fs'
import { mkdirp, readFile, writeFile, readdir } from 'fs-extra'
import { zipUnPack } from '@shared/file'
import axios from 'axios'
import Tool from './Tool'

class Manager extends Base {
  constructor() {
    super()
  }

  _initNVM(): Promise<string> {
    return new Promise(async (resolve) => {
      const fixPath = async () => {
        let allPath: string[] = []
        try {
          allPath = await Tool.fetchPATH()
        } catch (e) {
          return
        }
        if (allPath.includes('%NVM_HOME%')) {
          return
        }
        allPath.push('%NVM_HOME%')
        const savePath = allPath
          .map((p) => {
            if (p.includes('%')) {
              return p.replace(new RegExp('%', 'g'), '#').replace(new RegExp('#', 'g'), '%%')
            }
            return p
          })
          .join(';')
        try {
          await execPromiseRoot(`setx /M PATH "${savePath}"`)
        } catch (e) {}
      }

      let NVM_HOME = ''
      try {
        const command = `set NVM_HOME`
        const res = await execPromiseRoot(command)
        NVM_HOME = res?.stdout?.trim()?.replace('NVM_HOME=', '').trim()
      } catch (e) {}
      if (NVM_HOME) {
        console.log('NVM_HOME 0: ', NVM_HOME)
        await fixPath()
        resolve(NVM_HOME)
        return
      }

      try {
        const command = `powershell.exe -command "$env:NVM_HOME"`
        const res = await execPromiseRoot(command)
        NVM_HOME = res?.stdout?.trim()?.replace('NVM_HOME=', '').trim()
      } catch (e) {}
      if (NVM_HOME) {
        console.log('NVM_HOME 1: ', NVM_HOME)
        await fixPath()
        resolve(NVM_HOME)
        return
      }

      const local = join(global.Server.AppDir!, 'nvm/nvm.exe')
      if (!existsSync(local)) {
        await zipUnPack(join(global.Server.Static!, `zip/nvm.7z`), global.Server.AppDir!)
        const installcmd = join(global.Server.AppDir!, 'nvm/install.cmd')
        const nvmDir = join(global.Server.AppDir!, 'nvm')
        const linkDir = join(global.Server.AppDir!, 'nvm/nodejs-link')
        let content = await readFile(installcmd, 'utf-8')
        content = content.replace('##NVM_PATH##', nvmDir).replace('##NVM_SYMLINK##', linkDir)
        await writeFile(installcmd, content)
        process.chdir(nvmDir)
        try {
          const res = await execPromiseRoot('install.cmd')
          console.log('installNvm res: ', res)
        } catch (e) {}
      }
      NVM_HOME = dirname(local)
      const NVM_SYMLINK = join(NVM_HOME, 'nodejs-link')
      try {
        await execPromiseRoot(`setx /M NVM_HOME "${NVM_HOME}"`)
        await execPromiseRoot(`setx /M NVM_SYMLINK "${NVM_SYMLINK}"`)
      } catch (e) {}
      await fixPath()
      resolve(NVM_HOME)
    })
  }

  _initFNM(): Promise<string> {
    return new Promise(async (resolve) => {
      const fixPath = async () => {
        let allPath: string[] = []
        try {
          allPath = await Tool.fetchPATH()
        } catch (e) {
          return
        }
        if (allPath.includes('%FNM_HOME%')) {
          return
        }
        allPath.push('%FNM_HOME%')
        const savePath = allPath
          .map((p) => {
            if (p.includes('%')) {
              return p.replace(new RegExp('%', 'g'), '#').replace(new RegExp('#', 'g'), '%%')
            }
            return p
          })
          .join(';')
        try {
          await execPromiseRoot(`setx /M PATH "${savePath}"`)
        } catch (e) {}
      }

      let FNM_HOME = ''
      try {
        const command = `set FNM_HOME`
        const res = await execPromiseRoot(command)
        FNM_HOME = res?.stdout?.trim()?.replace('FNM_HOME=', '').trim()
      } catch (e) {}
      if (FNM_HOME) {
        console.log('FNM_HOME 0: ', FNM_HOME)
        await fixPath()
        resolve(FNM_HOME)
        return
      }

      try {
        const command = `powershell.exe -command "$env:FNM_HOME"`
        const res = await execPromiseRoot(command)
        FNM_HOME = res?.stdout?.trim()?.replace('FNM_HOME=', '').trim()
      } catch (e) {}
      if (FNM_HOME) {
        console.log('FNM_HOME 1: ', FNM_HOME)
        await fixPath()
        resolve(FNM_HOME)
        return
      }

      const local = join(global.Server.AppDir!, 'fnm/fnm.exe')
      if (!existsSync(local)) {
        await zipUnPack(join(global.Server.Static!, `zip/fnm.7z`), global.Server.AppDir!)
        const installcmd = join(global.Server.AppDir!, 'fnm/install.cmd')
        const nvmDir = join(global.Server.AppDir!, 'fnm')
        let content = await readFile(installcmd, 'utf-8')
        content = content.replace('##FNM_PATH##', nvmDir)
        let profile: any = await exec('$profile', { shell: 'powershell.exe' })
        profile = profile.stdout.trim()
        const profile_root = profile.replace('WindowsPowerShell', 'PowerShell')
        await mkdirp(dirname(profile))
        await mkdirp(dirname(profile_root))
        content = content.replace('##PROFILE_ROOT##', profile_root.trim())
        content = content.replace('##PROFILE##', profile.trim())
        await writeFile(installcmd, content)
        process.chdir(nvmDir)
        try {
          const res = await execPromiseRoot('install.cmd')
          console.log('installNvm res: ', res)
        } catch (e) {}
      }
      FNM_HOME = dirname(local)
      try {
        await execPromiseRoot(`setx /M FNM_HOME "${FNM_HOME}"`)
      } catch (e) {}
      await fixPath()
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
      const regex = /href="v([\d\.]+?)\/"/g
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

  localVersion(tool: 'fnm' | 'nvm') {
    return new ForkPromise(async (resolve) => {
      let dir = ''
      if (tool === 'fnm') {
        dir = await this._initFNM()
      } else {
        dir = await this._initNVM()
      }
      if (!dir) {
        resolve({
          versions: [],
          current: '',
          tool
        })
      }
      console.log('localVersion: ', dir, existsSync(dir))
      let res: any
      process.chdir(dir)
      try {
        res = await execPromiseRoot(`${tool}.exe ls`)
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
      try {
        await exec(command, {
          cwd: dir
        })
        const { current }: any = await this.localVersion(tool)
        if (current === select) {
          resolve(true)
        } else {
          reject(new Error('Fail'))
        }
      } catch (e) {
        console.log('versionChange error: ', e)
        reject(e)
      }
    })
  }

  installOrUninstall(tool: 'fnm' | 'nvm', action: 'install' | 'uninstall', version: string) {
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
        command = `fnm.exe ${action} ${version}`
      } else {
        command = `nvm.exe ${action} ${version}`
      }
      try {
        await exec(command, {
          cwd: dir
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

  allInstalled() {
    return new ForkPromise(async (resolve) => {
      const all: any[] = []
      let fnmDir = ''
      try {
        fnmDir = (
          await exec(`echo %FNM_DIR%`, {
            shell: 'cmd.exe'
          })
        ).stdout.trim()
        if (fnmDir === '%FNM_DIR%') {
          fnmDir = ''
        }
      } catch (e) {}
      if (!fnmDir) {
        try {
          fnmDir = (
            await exec(`$env:FNM_DIR`, {
              shell: 'powershell.exe'
            })
          ).stdout.trim()
        } catch (e) {}
      }
      if (fnmDir && existsSync(fnmDir)) {
        fnmDir = join(fnmDir, 'node-versions')
        if (existsSync(fnmDir)) {
          let allFnm: any[] = []
          try {
            allFnm = await readdir(fnmDir)
          } catch (e) {}
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
          await exec(`nvm root`, {
            shell: 'cmd.exe'
          })
        ).stdout
          .trim()
          .replace('Current Root: ', '')
      } catch (e) {}
      if (!nvmDir) {
        try {
          nvmDir = (
            await exec(`nvm root`, {
              shell: 'powershell.exe'
            })
          ).stdout
            .trim()
            .replace('Current Root: ', '')
        } catch (e) {}
      }
      if (nvmDir && existsSync(nvmDir)) {
        if (existsSync(nvmDir)) {
          let allNVM: any[] = []
          try {
            allNVM = await readdir(nvmDir)
          } catch (e) {}
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
}

export default new Manager()
