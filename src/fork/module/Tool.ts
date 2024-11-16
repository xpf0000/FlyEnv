import { createReadStream, readFileSync, realpathSync, statSync } from 'fs'
import { Base } from './Base'
import { getAllFileAsync, uuid, systemProxyGet } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { appendFile, existsSync, mkdirp, readdir, readFile, remove, writeFile } from 'fs-extra'
import { TaskQueue, TaskItem, TaskQueueProgress } from '@shared/TaskQueue'
import { join, dirname } from 'path'
import { I18nT } from '../lang'
import { execPromiseRoot } from '@shared/Exec'
import type { SoftInstalled } from '@shared/app'

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

  fetchPATH(): ForkPromise<string[]> {
    return new ForkPromise(async (resolve) => {
      const file = join(global.Server.UserHome!, '.zshrc')
      if (!existsSync(file)) {
        resolve([])
        return
      }
      try {
        const content = await readFile(file, 'utf-8')
        const x: any = content.match(
          /(#PHPWEBSTUDY-PATH-SET-BEGIN#)([\s\S]*?)(#PHPWEBSTUDY-PATH-SET-END#)/g
        )
        if (!x || x.length === 0) {
          resolve([])
          return
        }
        const dir = join(dirname(global.Server.AppDir!), 'env')
        if (!existsSync(dir)) {
          resolve([])
          return
        }
        let allFile = await readdir(dir)
        allFile = allFile
          .filter((f) => existsSync(join(dir, f)))
          .map((f) => realpathSync(join(dir, f)))
          .filter((f) => existsSync(f) && statSync(f).isDirectory())
        resolve(allFile)
      } catch (e) {
        resolve([])
      }
    })
  }

  updatePATH(item: SoftInstalled, flag: string) {
    return new ForkPromise(async (resolve) => {
      const all = await this.fetchPATH()
      let bin = dirname(item.bin)
      if (flag === 'php') {
        bin = dirname(item?.phpBin ?? join(item.path, 'bin/php'))
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

      const files = [
        join(global.Server.UserHome!, '.zshrc'),
        join(global.Server.UserHome!, '.config/fish/config.fish')
      ]
      const handleFile = async (file: string) => {
        if (file.includes('.zshrc') && !existsSync(file)) {
          try {
            await writeFile(file, '')
          } catch (e) {}
        }
        if (!existsSync(file)) {
          return
        }
        let content = ''
        let hasErr = false
        try {
          content = await readFile(file, 'utf-8')
        } catch (e) {
          hasErr = true
        }
        if (hasErr) {
          const cacheFile = join(global.Server.Cache!, `${uuid()}.txt`)
          try {
            await execPromiseRoot(['cp', '-f', file, cacheFile])
            content = await readFile(cacheFile, 'utf-8')
            await execPromiseRoot(['rm', '-rf', cacheFile])
            hasErr = false
          } catch (e) {
            hasErr = true
          }
        }
        if (hasErr) {
          return
        }
        const contentBack = content
        let x: any = content.match(
          /(#PHPWEBSTUDY-PATH-SET-BEGIN#)([\s\S]*?)(#PHPWEBSTUDY-PATH-SET-END#)/g
        )
        if (x && x[0]) {
          x = x[0]
          content = content.replace(`\n${x}`, '').replace(`${x}`, '')
        }
        if (allFile.length > 0) {
          let java = allFile.find(
            (f) =>
              (f.toLowerCase().includes('java') || f.toLowerCase().includes('jdk')) &&
              realpathSync(f).includes('/Contents/Home/')
          )
          let java_home = ''
          if (java) {
            java = dirname(realpathSync(java))
            if (file.includes('.zshrc')) {
              java_home = `\nexport JAVA_HOME="${java}"`
            } else {
              java_home = `\nset -gx JAVA_HOME "${java}"`
            }
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
          if (file.includes('.zshrc')) {
            const text = `\n#PHPWEBSTUDY-PATH-SET-BEGIN#\nexport PATH="${allFile.join(':')}:$PATH"${java_home}\n#PHPWEBSTUDY-PATH-SET-END#`
            content = content.trim() + text
          } else {
            const text = `\n#PHPWEBSTUDY-PATH-SET-BEGIN#\nset -gx PATH ${allFile.join(' ')} $PATH${java_home}\n#PHPWEBSTUDY-PATH-SET-END#`
            content = content.trim() + text
          }
        }
        if (content !== contentBack) {
          const cacheFile = join(global.Server.Cache!, `${uuid()}.txt`)
          await writeFile(cacheFile, content)
          try {
            await execPromiseRoot(['cp', '-f', cacheFile, file])
          } catch (e) {}
          try {
            await execPromiseRoot(['rm', '-rf', cacheFile])
          } catch (e) {}
          if (file.includes('.zshrc')) {
            try {
              await execPromiseRoot(['source', file])
            } catch (e) {}
          }
        }
      }
      try {
        await Promise.all(files.map((f) => handleFile(f)))
      } catch (e) {
        const debugFile = join(global.Server.BaseDir!, 'debug.log')
        await appendFile(debugFile, `[updatePATH][error]: ${e} !!!\n`)
      }
      resolve(allFile.map((f) => realpathSync(f)))
    })
  }
}

export default new Manager()
