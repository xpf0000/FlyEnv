import { Base } from './Base'
import { execPromise } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { join } from 'path'
import { compareVersions } from 'compare-versions'
import { exec } from 'child-process-promise'
import { existsSync } from 'fs'
import { chmod, copyFile, unlink } from 'fs-extra'
import { execPromiseRootWhenNeed } from '@shared/Exec'
import { fixEnv } from '@shared/utils'

class Manager extends Base {
  constructor() {
    super()
  }

  allVersion(tool: 'fnm' | 'nvm') {
    return new ForkPromise(async (resolve, reject) => {
      let command = ''
      if (tool === 'fnm') {
        command = 'fnm ls-remote'
      } else {
        command =
          'export NVM_DIR="${HOME}/.nvm";[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";nvm ls-remote'
      }
      try {
        const env = await fixEnv()
        const res = await exec(command, {
          env
        })
        const str = res?.stdout ?? ''
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
      let command = ''
      if (tool === 'fnm') {
        command = 'fnm ls'
      } else {
        command =
          'export NVM_DIR="${HOME}/.nvm";[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";nvm ls'
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
        command = `fnm default ${select}`
      } else {
        command = `export NVM_DIR="\${HOME}/.nvm";[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";nvm alias default ${select}`
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
        const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'
        const params = ['node.sh', flag, arch]
        execPromiseRootWhenNeed('zsh', params, {
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
      let command = ''
      if (tool === 'fnm') {
        command = `fnm ${action} ${version}`
      } else {
        command = `export NVM_DIR="\${HOME}/.nvm";[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";nvm ${action} ${version}`
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
}

export default new Manager()
