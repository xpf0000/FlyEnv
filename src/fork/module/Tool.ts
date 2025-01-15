import { createReadStream, readFileSync, realpathSync, statSync } from 'fs'
import { Base } from './Base'
import { getAllFileAsync, uuid, systemProxyGet, writeFileByRoot, readFileByRoot } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import {
  appendFile,
  chmod,
  copyFile,
  existsSync,
  mkdirp,
  readdir,
  remove,
  writeFile
} from 'fs-extra'
import { TaskQueue, TaskItem, TaskQueueProgress } from '@shared/TaskQueue'
import { join, dirname, resolve as PathResolve, basename } from 'path'
import { I18nT } from '../lang'
import { execPromiseRoot, execPromise } from '@shared/Exec'
import type { AppServiceAliasItem, SoftInstalled } from '@shared/app'

class BomCleanTask implements TaskItem {
  path = ''
  constructor(path: string) {
    this.path = path
  }
  run(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const path = this.path
      try {
        let handled = false
        const stream = createReadStream(path, {
          start: 0,
          end: 3
        })
        stream.on('data', (chunk) => {
          handled = true
          stream.close()
          let buff: any = chunk
          if (
            buff &&
            buff.length >= 3 &&
            buff[0].toString(16).toLowerCase() === 'ef' &&
            buff[1].toString(16).toLowerCase() === 'bb' &&
            buff[2].toString(16).toLowerCase() === 'bf'
          ) {
            buff = readFileSync(path)
            buff = buff.slice(3)
            writeFile(path, buff, 'binary', (err) => {
              buff = null
              if (err) {
                reject(err)
              } else {
                resolve(true)
              }
            })
          } else {
            resolve(false)
          }
        })
        stream.on('error', (err) => {
          handled = true
          stream.close()
          reject(err)
        })
        stream.on('close', () => {
          if (!handled) {
            handled = true
            resolve(false)
          }
        })
      } catch (err) {
        reject(err)
      }
    })
  }
}

class Manager extends Base {
  jiebaLoad = false
  jiebaLoadFail = false
  constructor() {
    super()
  }

  getAllFile(fp: string, fullpath = true) {
    return new ForkPromise((resolve, reject) => {
      getAllFileAsync(fp, fullpath).then(resolve).catch(reject)
    })
  }

  cleanBom(files: Array<string>) {
    return new ForkPromise((resolve, reject, on) => {
      const taskQueue = new TaskQueue()
      taskQueue
        .progress((progress: TaskQueueProgress) => {
          on(progress)
        })
        .end(() => {
          resolve(true)
        })
        .initQueue(
          files.map((p) => {
            return new BomCleanTask(p)
          })
        )
        .run()
    })
  }

  systemEnvFiles() {
    return new ForkPromise(async (resolve, reject) => {
      const envFiles = [
        join(global.Server.UserHome!, '.config/fish/config.fish'),
        join(global.Server.UserHome!, '.bashrc'),
        join(global.Server.UserHome!, '.profile'),
        join(global.Server.UserHome!, '.bash_login'),
        join(global.Server.UserHome!, '.zprofile'),
        join(global.Server.UserHome!, '.zshrc'),
        join(global.Server.UserHome!, '.bash_profile'),
        '/etc/paths',
        '/etc/profile'
      ]
      try {
        const files = envFiles.filter((e) => existsSync(e))
        resolve(files)
      } catch (e) {
        reject(e)
      }
    })
  }
  systemEnvSave(file: string, content: string) {
    return new ForkPromise(async (resolve, reject) => {
      if (!existsSync(file)) {
        reject(new Error(I18nT('fork.toolFileNotExist')))
        return
      }
      try {
        const cacheFile = join(global.Server.Cache!, `${uuid()}.txt`)
        await writeFile(cacheFile, content)
        await execPromiseRoot([`cp`, `-f`, cacheFile, file])
        await remove(cacheFile)
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }

  sysetmProxy() {
    return new ForkPromise((resolve) => {
      systemProxyGet()
        .then((proxy) => {
          resolve(proxy)
        })
        .catch(() => {
          resolve(false)
        })
    })
  }

  fetchEnvPath(): ForkPromise<string[]> {
    return new ForkPromise(async (resolve) => {
      const sh = join(global.Server.Static!, 'sh/path.sh')
      const cpSh = join(global.Server.Cache!, `${uuid()}.sh`)
      await copyFile(sh, cpSh)
      await chmod(cpSh, '0777')
      const arr: string[] = []
      try {
        const res = await execPromise(`cd ${dirname(cpSh)} && ./${basename(cpSh)}`)
        const list = res?.stdout?.trim()?.split(':') ?? []
        arr.push(...list)
      } catch (e) {}
      await remove(cpSh)
      resolve(Array.from(new Set(arr)))
    })
  }

  fetchPATH(): ForkPromise<{ allPath: string[]; appPath: string[] }> {
    return new ForkPromise(async (resolve) => {
      const res: any = {
        allPath: [],
        appPath: []
      }
      const pathArr = await this.fetchEnvPath()
      const allPath = pathArr
        .filter((f) => existsSync(f))
        .map((f) => realpathSync(f))
        .filter((f) => existsSync(f) && statSync(f).isDirectory())
      res.allPath = Array.from(new Set(allPath))

      const dir = join(dirname(global.Server.AppDir!), 'env')
      if (existsSync(dir)) {
        let allFile = await readdir(dir)
        allFile = allFile
          .filter((f) => existsSync(join(dir, f)))
          .map((f) => realpathSync(join(dir, f)))
          .filter((f) => existsSync(f) && statSync(f).isDirectory())
        res.appPath = Array.from(new Set(allFile))
      }
      resolve(res)
    })
  }

  handleUpdatePath(param?: { zsh: string }) {
    return new ForkPromise(async (resolve, reject) => {
      const file = join(global.Server.UserHome!, '.zshrc')
      if (!existsSync(file)) {
        try {
          await writeFile(file, '')
        } catch (e) {}
      }
      if (!existsSync(file)) {
        reject(new Error(`No found ${file} and create file failed`))
        return
      }
      let content = ''
      try {
        content = await readFileByRoot(file)
      } catch (e) {
        reject(e)
        return
      }
      const appDir = dirname(global.Server.AppDir!)
      const contentBack = content

      const regex = new RegExp(
        `^(?!\\s*#)\\s*export\\s*PATH\\s*=\\s*"(.*?)(${appDir})(.*?)\\$PATH"`,
        'gmu'
      )
      const regex2 = new RegExp(`^(?!\\s*#)\\s*export\\s*JAVA_HOME\\s*=\\s*"(.*?)"`, 'gmu')
      const regexArr = [regex, regex2]
      regexArr.forEach((regex) => {
        let x: any = content.match(regex)
        if (x && x[0]) {
          x = x[0]
          content = content.replace(`\n${x}`, '').replace(`${x}`, '')
        }
      })
      if (param) {
        const text = param.zsh
        content = content.trim() + text
      }
      if (content !== contentBack) {
        try {
          await writeFileByRoot(file, content)
        } catch (e) {}
        try {
          await execPromiseRoot(['source', file])
        } catch (e) {}
      }
      resolve(true)
    })
  }

  updatePATH(item: SoftInstalled, flag: string) {
    return new ForkPromise(async (resolve, reject) => {
      const all = (await this.fetchPATH()).allPath
      let bin = dirname(item.bin)
      if (flag === 'php') {
        if (item?.phpBin) {
          bin = dirname(item?.phpBin)
        } else if (existsSync(join(item.path, 'bin/php'))) {
          bin = join(item.path, 'bin')
        } else if (existsSync(join(item.path, 'php'))) {
          bin = item.path
        }
      }
      const envDir = join(dirname(global.Server.AppDir!), 'env')
      if (!existsSync(envDir)) {
        await mkdirp(envDir)
      }
      const flagDir = join(envDir, flag)
      try {
        await execPromiseRoot(['rm', '-rf', flagDir])
      } catch (e) {}
      if (!all.includes(bin)) {
        try {
          await execPromiseRoot(['ln', '-s', bin, flagDir])
        } catch (e) {}
      }
      let allFile = await readdir(envDir)
      allFile = allFile
        .filter((f) => existsSync(join(envDir, f)))
        .map((f) => join(envDir, f))
        .filter((f) => {
          let check = false
          try {
            const rf = realpathSync(f)
            check = existsSync(rf) && statSync(rf).isDirectory()
          } catch (e) {
            check = false
          }
          return check
        })

      const aliasDir = PathResolve(global.Server.BaseDir!, '../alias')
      const param: { zsh: string } = {
        zsh: ''
      }
      if (allFile.length > 0) {
        let java = allFile.find(
          (f) =>
            (f.toLowerCase().includes('java') || f.toLowerCase().includes('jdk')) &&
            realpathSync(f).includes('/Contents/Home/')
        )
        let java_home_zsh = ''
        if (java) {
          java = dirname(realpathSync(java))
          java_home_zsh = `\nexport JAVA_HOME="${java}"`
        }
        let python = allFile.find((f) => realpathSync(f).includes('Python.framework'))
        if (python) {
          python = realpathSync(python)
          const py = join(python, 'python')
          const py3 = join(python, 'python3')
          if (existsSync(py3) && !existsSync(py)) {
            try {
              await execPromiseRoot(['ln', '-s', py3, py])
            } catch (e) {}
          }
        }
        param.zsh = `\nexport PATH="${aliasDir}:${allFile.join(':')}:$PATH"${java_home_zsh}\n`
      } else {
        param.zsh = `\nexport PATH="${aliasDir}:$PATH"\n`
      }
      try {
        await this.handleUpdatePath(param)
      } catch (e) {
        const debugFile = join(global.Server.BaseDir!, 'debug.log')
        await appendFile(debugFile, `[updatePATH][error]: ${e} !!!\n`)
        reject(e)
        return
      }
      const allPath = await this.fetchPATH()
      resolve(allPath)
    })
  }

  setAlias(
    service: SoftInstalled,
    item: AppServiceAliasItem | undefined,
    old: AppServiceAliasItem | undefined,
    alias: Record<string, AppServiceAliasItem[]>
  ) {
    return new ForkPromise(async (resolve, reject) => {
      const aliasDir = PathResolve(global.Server.BaseDir!, '../alias')
      await mkdirp(aliasDir)
      if (old?.id) {
        const oldFile = join(aliasDir, `${old.name}`)
        if (existsSync(oldFile)) {
          await remove(oldFile)
        }
        const index = alias?.[service.bin]?.findIndex((a) => a.id === old.id)
        if (index >= 0) {
          alias[service.bin].splice(index, 1)
        }
      }

      if (item) {
        const file = join(aliasDir, `${item.name}`)
        if (item?.php?.bin) {
          const content = `#!/bin/zsh
"${item?.php?.bin}" "${service.bin}" $@`
          await writeFile(file, content)
        } else {
          let bin = service.bin
          if (service.typeFlag === 'php') {
            bin = service?.phpBin ?? join(service.path, 'bin/php')
          }
          const content = `#!/bin/zsh
"${bin}" $@`
          await writeFile(file, content)
          await chmod(file, '0777')
        }
        if (!item.id) {
          item.id = uuid(8)
          if (!alias[service.bin]) {
            alias[service.bin] = []
          }
          alias[service.bin].unshift(item)
        } else {
          const index = alias?.[service.bin]?.findIndex((a) => a.id === item.id)
          if (index >= 0) {
            alias[service.bin].splice(index, 1, item)
          } else {
            alias[service.bin].unshift(item)
          }
        }
      }

      const allPath = (await this.fetchPATH()).allPath
      if (allPath.includes(aliasDir)) {
        const res = await this.cleanAlias(alias)
        resolve(res)
        return
      }

      const zshrc = join(global.Server.UserHome!, '.zshrc')
      if (!existsSync(zshrc)) {
        try {
          await writeFile(zshrc, '')
        } catch (e) {}
      }
      if (!existsSync(zshrc)) {
        reject(new Error(`No found ${zshrc} and create file failed`))
        return
      }

      let content = ''
      try {
        content = await readFileByRoot(zshrc)
      } catch (e) {
        reject(e)
        return
      }

      const appDir = dirname(global.Server.AppDir!)
      const regex = new RegExp(
        `^(?!\\s*#)\\s*export\\s*PATH\\s*=\\s*"(.*?)(${appDir})(.*?)\\$PATH"`,
        'gmu'
      )

      const matchs = content.match(regex) ?? []
      const arr: string[] = []
      matchs.forEach((x: string) => {
        content = content.replace(`\n${x}`, '').replace(`${x}`, '')
        const list = x
          .trim()
          .replace('export', '')
          .replace('PATH', '')
          .replace('=', '')
          .replace(new RegExp('"'), '')
          .replace(new RegExp('\\$PATH'), '')
          .split(':')
          .filter((s) => !!s.trim())
        arr.push(...list)
      })
      arr.unshift(aliasDir)
      arr.push(`$PATH`)
      const path = Array.from(new Set(arr)).join(':')
      content = content.trim() + `\nexport PATH="${path}"\n`
      try {
        await writeFileByRoot(zshrc, content)
      } catch (e) {}
      try {
        await execPromiseRoot(['source', zshrc])
      } catch (e) {}

      const res = await this.cleanAlias(alias)
      resolve(res)
    })
  }

  cleanAlias(alias: Record<string, AppServiceAliasItem[]>) {
    return new ForkPromise(async (resolve) => {
      const aliasDir = PathResolve(global.Server.BaseDir!, '../alias')
      for (const bin in alias) {
        const item = alias[bin]
        if (!existsSync(bin)) {
          for (const i of item) {
            const file = join(aliasDir, `${i.name}`)
            if (existsSync(file)) {
              await remove(file)
            }
          }
          delete alias[bin]
        } else {
          const arr: AppServiceAliasItem[] = []
          for (const i of item) {
            if (i?.php?.bin && !existsSync(i?.php?.bin)) {
              const file = join(aliasDir, `${i.name}`)
              if (existsSync(file)) {
                await remove(file)
              }
              continue
            }
            arr.push(i)
          }
          alias[bin] = arr
        }
      }
      resolve(alias)
    })
  }
}

export default new Manager()
