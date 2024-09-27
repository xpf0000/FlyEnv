import { Base } from './Base'
import { execPromise, execPromiseRoot, fixEnv, spawnPromise } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { dirname, join } from 'path'
import { compareVersions } from 'compare-versions'
import { exec } from 'child_process'
import { existsSync } from 'fs'
import { mkdirp, readFile, writeFile, appendFile } from 'fs-extra'
import { zipUnPack } from '@shared/file'
import axios from 'axios'

class Manager extends Base {
  constructor() {
    super()
  }

  allVersion(tool: 'fnm' | 'nvm') {
    return new ForkPromise(async (resolve, reject) => {
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
        .filter((s) => Number(s.split('.')[0]) > 5)
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
    return new ForkPromise(async (resolve, reject) => {
      let command = ''
      if (tool === 'fnm') {
        command = 'fnm ls'
      } else {
        command = 'nvm ls'
      }
      try {
        const res = await execPromise(command)
        console.log('localVersion: ', res)
        const stdout = res.stdout
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
      } catch (e) {
        console.log('localVersion err: ', e)
        reject(e)
      }
    })
  }

  versionChange(tool: 'fnm' | 'nvm', select: string) {
    return new ForkPromise((resolve, reject) => {
      let command = ''
      if (tool === 'fnm') {
        command = `fnm default ${select}`
      } else {
        command = `nvm use ${select}`
      }
      try {
        exec(
          command,
          {
            env: fixEnv()
          },
          async () => {
            const { current }: any = await this.localVersion(tool)
            if (current === select) {
              resolve(true)
            } else {
              reject(new Error('Fail'))
            }
          }
        )
      } catch (e) {
        console.log('versionChange error: ', e)
        reject(e)
      }
    })
  }

  installNvm(flag: string) {
    return new ForkPromise(async (resolve, reject, on) => {
      try {
        if (flag === 'nvm') {
          const bin = join(global.Server.AppDir!, 'nvm/nvm.exe')
          if (!existsSync(bin)) {
            await zipUnPack(join(global.Server.Static!, `zip/nvm.7z`), global.Server.AppDir!)
            const installcmd = join(global.Server.AppDir!, 'nvm/install.cmd')
            const nvmDir = join(global.Server.AppDir!, 'nvm')
            let content = await readFile(installcmd, 'utf-8')
            content = content.replace('##NVM_PATH##', nvmDir)
            await writeFile(installcmd, content)
            process.chdir(nvmDir)
            const res = await execPromiseRoot('install.cmd')
            console.log('installNvm res: ', res)
          }
        } else if (flag === 'fnm') {
          const bin = join(global.Server.AppDir!, 'fnm/fnm.exe')
          if (!existsSync(bin)) {
            await zipUnPack(join(global.Server.Static!, `zip/fnm.7z`), global.Server.AppDir!)
            const installcmd = join(global.Server.AppDir!, 'fnm/install.cmd')
            const nvmDir = join(global.Server.AppDir!, 'fnm')
            let content = await readFile(installcmd, 'utf-8')
            content = content.replace('##FNM_PATH##', nvmDir)
            let profile: any = await execPromise('$profile', { shell: 'powershell.exe' })
            profile = profile.stdout.trim()
            const profile_root = profile.replace('WindowsPowerShell', 'PowerShell')
            await mkdirp(dirname(profile))
            await mkdirp(dirname(profile_root))
            content = content.replace('##PROFILE_ROOT##', profile_root.trim())
            content = content.replace('##PROFILE##', profile.trim())
            await writeFile(installcmd, content)
            process.chdir(nvmDir)
            const res = await execPromiseRoot('install.cmd')
            console.log('installNvm res: ', res)
          }
        }
      } catch (e) {
        reject(e)
        return
      }
      setTimeout(() => {
        resolve(true)
      }, 5000)
    })
  }

  installOrUninstall(tool: 'fnm' | 'nvm', action: 'install' | 'uninstall', version: string) {
    return new ForkPromise((resolve, reject) => {
      let command = ''
      if (tool === 'fnm') {
        command = `fnm ${action} ${version}`
      } else {
        command = `nvm ${action} ${version}`
      }
      try {
        exec(
          command,
          {
            env: fixEnv()
          },
          async () => {
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
          }
        )
      } catch (e) {
        reject(e)
      }
    })
  }

  nvmDir() {
    return new ForkPromise(async (resolve) => {
      const bin: Set<string> = new Set()
      try {
        await spawnPromise('cmd.exe', ['/c', 'nvm.exe', '-v'], { shell: 'cmd.exe' })
        bin.add('nvm')
      } catch (e) {
        await appendFile(
          join(global.Server.BaseDir!, 'debug.log'),
          `[node][nvmDir-cmd-nvm][error]: ${e}\n`
        )
      }

      try {
        await execPromise('nvm -v', { shell: 'powershell.exe' })
        bin.add('nvm')
      } catch (e) {
        await appendFile(
          join(global.Server.BaseDir!, 'debug.log'),
          `[node][nvmDir-ps-nvm][error]: ${e}\n`
        )
      }

      try {
        await spawnPromise('cmd.exe', ['/c', 'fnm.exe', '-V'], { shell: 'cmd.exe' })
        bin.add('fnm')
      } catch (e) {
        await appendFile(
          join(global.Server.BaseDir!, 'debug.log'),
          `[node][nvmDir-cmd-fnm][error]: ${e}\n`
        )
      }

      try {
        await execPromise('fnm -V', { shell: 'powershell.exe' })
        bin.add('fnm')
      } catch (e) {
        await appendFile(
          join(global.Server.BaseDir!, 'debug.log'),
          `[node][nvmDir-ps-fnm][error]: ${e}\n`
        )
      }

      if (bin.size === 2) {
        resolve('all')
        return
      }

      resolve([...bin].pop() ?? '')
      // resolve('')
    })
  }
}

export default new Manager()
