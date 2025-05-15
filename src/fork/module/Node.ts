import { Base } from './Base'
import {
  execPromise,
  readFileByRoot,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  writeFileByRoot
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { basename, dirname, join } from 'path'
import { compareVersions } from 'compare-versions'
import { exec } from 'child-process-promise'
import { createWriteStream, existsSync } from 'fs'
import { chmod, copyFile, unlink, readdir, writeFile, realpath, remove, mkdirp } from 'fs-extra'
import axios from 'axios'
import type { SoftInstalled } from '@shared/app'
import TaskQueue from '../TaskQueue'
import ncu from 'npm-check-updates'
import EnvSync from '../util/EnvSync'
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
        const env = await EnvSync.sync()
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

  private resetEnv(tool: 'fnm' | 'nvm') {
    return new Promise(async (resolve) => {
      const file = join(global.Server.UserHome!, '.zshrc')
      if (!existsSync(file)) {
        try {
          await writeFile(file, '')
        } catch (e) {}
      }
      if (!existsSync(file)) {
        resolve(true)
        return
      }
      let content = ''
      try {
        content = await readFileByRoot(file)
      } catch (e) {
        resolve(true)
        return
      }
      let NVM_DIR = ''
      const lines = content.split('\n')
      const newLines: string[] = []
      lines.forEach((s) => {
        if (tool === 'fnm') {
          const jump = s.includes('eval') && s.includes('fnm env')
          if (!jump) {
            newLines.push(s)
          }
        } else {
          if (s.trim().startsWith('export NVM_DIR=')) {
            NVM_DIR = s
          }
          const jump =
            s.includes('export NVM_DIR=') ||
            s.includes('"$NVM_DIR/nvm.sh"') ||
            s.includes('"$NVM_DIR/bash_completion"')
          if (!jump) {
            newLines.push(s)
          }
        }
      })
      if (tool === 'fnm') {
        newLines.push(`eval "$(fnm env --use-on-cd --shell zsh)"`)
      } else {
        if (NVM_DIR) {
          newLines.push(NVM_DIR)
        }
        newLines.push(`[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"  # This loads nvm`)
        newLines.push(
          `[ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion`
        )
      }
      content = newLines.join('\n')
      try {
        await writeFileByRoot(file, content)
      } catch (e) {
        resolve(true)
        return
      }
      resolve(true)
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
        const env = await EnvSync.sync()
        await exec(command, {
          env
        })
        const { current }: any = await this.localVersion(tool)
        if (current === select) {
          await this.resetEnv(tool)
          resolve(true)
        } else {
          reject(new Error('Fail'))
        }
      } catch (e) {
        reject(e)
      }
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
          const arch = global.Server.isAppleSilicon ? 'arm64' : 'x64'
          const url = `https://nodejs.org/dist/v${version}/node-v${version}-darwin-${arch}.tar.xz`
          const destDir = join(global.Server.AppDir!, `nodejs/v${version}`)
          if (existsSync(destDir)) {
            try {
              await remove(destDir)
            } catch (e) {}
          }
          await mkdirp(destDir)

          const zip = join(global.Server.Cache!, `node-v${version}.tar.xz`)

          const unpack = async () => {
            try {
              await execPromise(`tar -xzf ${zip} -C ${destDir}`)
              const subDirs = await readdir(destDir)
              const subDir = subDirs.pop()
              if (subDir) {
                await execPromise(`cd ${join(destDir, subDir)} && mv ./* ../`)
                await remove(join(destDir, subDir))
              }
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
            } catch (e) {}
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
      let command = ''
      if (tool === 'fnm') {
        command = `unset PREFIX;fnm ${action} ${version}`
      } else {
        command = `unset PREFIX;export NVM_DIR="\${HOME}/.nvm";[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh";nvm ${action} ${version}`
      }
      try {
        const env = await EnvSync.sync()
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

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      const dir = [...(setup?.node?.dirs ?? [])]
      Promise.all([versionLocalFetch(dir, 'node', 'node')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) =>
            TaskQueue.run(versionBinVersion, `${item.bin} -v`, /(v)(\d+(\.\d+){1,4})(.*?)$/gm)
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
              let path = item.bin
              if (path.includes('/sbin/') || path.includes('/bin/')) {
                path = path
                  .replace(`/sbin/`, '/##SPLIT##/')
                  .replace(`/bin/`, '/##SPLIT##/')
                  .split('/##SPLIT##/')
                  .shift()!
              } else {
                path = dirname(path)
              }
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
          } catch (e) {}

          const dir = join(global.Server.AppDir!, 'nodejs')
          if (existsSync(dir)) {
            const dirs = await readdir(dir)
            const appVersions: SoftInstalled[] = dirs
              .filter((s) => s.startsWith('v') && existsSync(join(dir, s, 'bin/node')))
              .map((s) => {
                const version = s.replace('v', '').trim()
                const path = join(dir, s)
                const bin = join(dir, s, 'bin/node')
                const num = version
                  ? Number(versionFixed(version).split('.').slice(0, 2).join(''))
                  : null
                return {
                  run: false,
                  running: false,
                  typeFlag: 'node',
                  path,
                  bin,
                  version,
                  num,
                  enable: true
                }
              })
            versions.push(...appVersions)
          }
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
