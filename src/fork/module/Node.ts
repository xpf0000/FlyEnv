import { Base } from './Base'
import { execPromise } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { join } from 'path'
import { compareVersions } from 'compare-versions'
import { exec } from 'child-process-promise'
import { existsSync } from 'fs'
import { chmod, copyFile, unlink, readdir } from 'fs-extra'
import { fixEnv } from '@shared/utils'
import axios from 'axios'

class Manager extends Base {
  constructor() {
    super()
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
        all: links
      })
    })
  }

  localVersion(tool: 'fnm' | 'nvm') {
    return new ForkPromise(async (resolve, reject) => {
      let command = ''
      if (tool === 'fnm') {
        command = 'unset PREFIX;fnm ls'
      } else {
        command = 'unset PREFIX;[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";nvm ls'
      }
      try {
        const env = await fixEnv()
        const res = await exec(command, {
          env
        })
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

  versionChange(tool: 'fnm' | 'nvm', select: string) {
    return new ForkPromise(async (resolve, reject) => {
      let command = ''
      if (tool === 'fnm') {
        command = `unset PREFIX;fnm default ${select}`
      } else {
        command = `unset PREFIX;export NVM_DIR="\${HOME}/.nvm";[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";nvm alias default ${select}`
      }
      try {
        const env = await fixEnv()
        await exec(command, {
          env
        })
        const { current }: any = await this.localVersion(tool)
        if (current === select) {
          resolve(true)
        } else {
          reject(new Error('Fail'))
        }
      } catch (e) {
        reject(e)
      }
    })
  }

  installOrUninstall(tool: 'fnm' | 'nvm', action: 'install' | 'uninstall', version: string) {
    return new ForkPromise(async (resolve, reject) => {
      let command = ''
      if (tool === 'fnm') {
        command = `unset PREFIX;fnm ${action} ${version}`
      } else {
        command = `unset PREFIX;export NVM_DIR="\${HOME}/.nvm";[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";nvm ${action} ${version}`
      }
      try {
        const env = await fixEnv()
        await exec(command, {
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

  nvmDir() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const sh = join(global.Server.Static!, 'sh/node.sh')
        const copyfile = join(global.Server.Cache!, 'node.sh')
        if (existsSync(copyfile)) {
          await unlink(copyfile)
        }
        await copyFile(sh, copyfile)
        await chmod(copyfile, '0777')
        const { stdout } = await execPromise(`source node.sh check`, {
          cwd: global.Server.Cache
        })
        resolve(stdout.trim())
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
        fnmDir = (await execPromise(`echo $FNM_DIR`)).stdout.trim()
      } catch (e) {}
      if (fnmDir && existsSync(fnmDir)) {
        fnmDir = join(fnmDir, 'node-versions')
        if (existsSync(fnmDir)) {
          let allFnm: any[] = []
          try {
            allFnm = await readdir(fnmDir)
          } catch (e) {}
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
        nvmDir = (await execPromise(`echo $NVM_DIR`)).stdout.trim()
      } catch (e) {}
      if (nvmDir && existsSync(nvmDir)) {
        nvmDir = join(nvmDir, 'versions/node')
        if (existsSync(nvmDir)) {
          let allNVM: any[] = []
          try {
            allNVM = await readdir(nvmDir)
          } catch (e) {}
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
}

export default new Manager()
