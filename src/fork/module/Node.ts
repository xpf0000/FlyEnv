import { Base } from './Base'
import { execPromise, spawnPromise } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { join } from 'path'
import { compareVersions } from 'compare-versions'
import { existsSync } from 'fs'
import { chmod, copyFile, unlink, appendFile } from 'fs-extra'

class Manager extends Base {
  constructor() {
    super()
  }

  _init_sh() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const sh = join(global.Server.Static!, 'sh/node.sh')
        const copyfile = join(global.Server.Cache!, 'node.sh')
        if (existsSync(copyfile)) {
          await unlink(copyfile)
        }
        await copyFile(sh, copyfile)
        await execPromise(`echo "${global.Server.Password}" | sudo -S chmod 777 ${copyfile}`)
        resolve(copyfile)
      } catch (e) {
        await appendFile(join(global.Server.BaseDir!, 'debug.log'), `[Node][nvmDir][Error]: ${e}`)
        reject(e)
      }
    })
  }

  allVersion(tool: 'fnm' | 'nvm') {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const copyfile = await this._init_sh()
        const flag = tool === 'fnm' ? 'fnm-version-list' : 'nvm-version-list'
        const stdout = await spawnPromise(`bash`, [copyfile, flag, global.Server.Password, 'null', 'ls-remote'])
        const str = stdout ?? ''
        const all =
          str?.match(/\sv\d+(\.\d+){1,4}\s/g)?.map((v) => {
            return v.trim().replace('v', '')
          }) ?? []
        resolve({
          all: all.reverse(),
          tool
        })
      } catch (e) {
        reject(e)
      }
    })
  }

  localVersion(tool: 'fnm' | 'nvm') {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const copyfile = await this._init_sh()
        const flag = tool === 'fnm' ? 'fnm-version-list' : 'nvm-version-list'
        const stdout = await spawnPromise(`bash`, [copyfile, flag, global.Server.Password, 'null', 'ls'])
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
      try {
        const copyfile = await this._init_sh()
        const flag = tool === 'fnm' ? 'fnm-default-version-change' : 'nvm-default-version-change'
        await spawnPromise(`bash`, [copyfile, flag, global.Server.Password, select, 'null'])
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

  installNvm(flag: string) {
    return new ForkPromise(async (resolve, reject, on) => {
      try {
        const sh = join(global.Server.Static!, 'sh/node.sh')
        const copyfile = join(global.Server.Cache!, 'node.sh')
        if (existsSync(copyfile)) {
          await unlink(copyfile)
        }
        await copyFile(sh, copyfile)
        await chmod(copyfile, '0777')
        const password = global.Server.Password!
        const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'
        const params = ['node.sh', flag, password, arch]
        spawnPromise('bash', params, {
          cwd: global.Server.Cache
        })
          .on(on)
          .then(() => {
            resolve(true)
          })
          .catch(reject)
      } catch (e) {
        reject(e)
      }
    })
  }

  installOrUninstall(tool: 'fnm' | 'nvm', action: 'install' | 'uninstall', version: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const copyfile = await this._init_sh()
        const flag = tool === 'fnm' ? 'fnm-install-version' : 'nvm-install-version'
        await spawnPromise(`bash`, [copyfile, flag, global.Server.Password, version, action])

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
        const copyfile = await this._init_sh()
        const stdout = await spawnPromise(`bash`, [copyfile, 'check'])
        resolve(stdout.trim())
      } catch (e) {
        reject(e)
      }
    })
  }
}

export default new Manager()
