import { createReadStream, readFileSync, realpathSync, statSync } from 'fs'
import { Base } from './Base'
import { getAllFileAsync, execPromise, uuid, systemProxyGet } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { existsSync, mkdirp, readdir, readFile, remove, writeFile } from 'fs-extra'
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
        '~/.config/fish/config.fish',
        '~/.bashrc',
        '~/.profile',
        '~/.bash_login',
        '~/.zprofile',
        '~/.zshrc',
        '~/.bash_profile',
        '/etc/paths',
        '/etc/profile'
      ]
      try {
        const home = await execPromise(`echo $HOME`)
        console.log('home: ', home)
        const files = envFiles
          .map((e) => e.replace('~', home.stdout.trim()))
          .filter((e) => existsSync(e))
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
    return new ForkPromise(async (resolve, reject) => {
      let file = '~/.zshrc'
      try {
        const home = await execPromise(`echo $HOME`)
        console.log('home: ', home)
        file = file.replace('~', home.stdout.trim())
        if (!existsSync(file)) {
          reject(new Error('~/.zshrc not found'))
          return
        }
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
          .map((f) => realpathSync(join(dir, f)))
          .filter((f) => statSync(f).isDirectory())
        resolve(allFile)
      } catch (e) {
        reject(e)
      }
    })
  }

  updatePATH(item: SoftInstalled, flag: string) {
    return new ForkPromise(async (resolve) => {
      console.log('updatePATH: ', item, flag)
      const all = await this.fetchPATH()
      let bin = dirname(item.bin)
      if (flag === 'php') {
        bin = dirname(item?.phpBin ?? join(item.path, 'bin/php'))
      }
      console.log('updatePATH: ', item, flag, bin)
      const envDir = join(dirname(global.Server.AppDir!), 'env')
      if (!existsSync(envDir)) {
        await mkdirp(envDir)
      }
      const flagDir = join(envDir, flag)
      await remove(flagDir)
      if (!all.includes(bin)) {
        await execPromiseRoot(['ln', '-s', bin, flagDir])
      }

      let allFile = await readdir(envDir)
      allFile = allFile
        .filter((f) => statSync(realpathSync(join(envDir, f))).isDirectory())
        .map((f) => join(envDir, f))

      const files = ['~/.zshrc', '~/.config/fish/config.fish']
      const home = await execPromise(`echo $HOME`)

      const handleFile = async (file: string) => {
        file = file.replace('~', home.stdout.trim())
        if (!existsSync(file)) {
          return
        }
        let content = await readFile(file, 'utf-8')
        let x: any = content.match(
          /(#PHPWEBSTUDY-PATH-SET-BEGIN#)([\s\S]*?)(#PHPWEBSTUDY-PATH-SET-END#)/g
        )
        if (x && x[0]) {
          x = x[0]
          content = content.replace(`\n${x}`, '')
        }
        if (allFile.length > 0) {
          let java = allFile.find(
            (f) => f.includes('java') && realpathSync(f).includes('/Contents/Home/')
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
          if (file.includes('.zshrc')) {
            const text = `\n#PHPWEBSTUDY-PATH-SET-BEGIN#\nexport PATH="${allFile.join(':')}:$PATH"${java_home}\n#PHPWEBSTUDY-PATH-SET-END#`
            content = content.trim() + text
          } else {
            const text = `\n#PHPWEBSTUDY-PATH-SET-BEGIN#\nset -gx PATH ${allFile.join(' ')} $PATH${java_home}\n#PHPWEBSTUDY-PATH-SET-END#`
            content = content.trim() + text
          }

          const cacheFile = join(global.Server.Cache!, `${uuid()}.txt`)
          await writeFile(cacheFile, content)
          await execPromiseRoot(['cp', '-f', cacheFile, file])
          await remove(cacheFile)
        }
      }

      await Promise.all(files.map((f) => handleFile(f)))
      resolve(allFile.map((f) => realpathSync(f)))
    })
  }

  async #getToolData() {
    let obj = {
      like: [],
      custom: []
    }
    const file = join(global.Server.BaseDir!, 'app.tools.json')
    if (existsSync(file)) {
      const json = await readFile(file, 'utf-8')
      try {
        obj = JSON.parse(json)
      } catch (e) {}
    }
    return obj
  }

  async #setToolData(data: any) {
    const file = join(global.Server.BaseDir!, 'app.tools.json')
    await writeFile(file, JSON.stringify(data))
  }

  toolsLike(item: any) {
    return new ForkPromise(async (resolve) => {
      const data: any = await this.#getToolData()
      if (data.like.includes(item.id)) {
        resolve(data)
        return
      }
      data.like.push(item.id)
      await this.#setToolData(data)
      resolve(data)
    })
  }

  toolsUnLike(item: any) {
    return new ForkPromise(async (resolve) => {
      const data: any = await this.#getToolData()
      if (data.like.includes(item.id)) {
        const index = data.like.indexOf(item.id)
        if (index >= 0) {
          data.like.splice(index, 1)
        }
        await this.#setToolData(data)
        resolve(data)
        return
      }
      resolve(data)
    })
  }

  initTools() {
    return new ForkPromise(async (resolve) => {
      const data: any = await this.#getToolData()
      resolve(data)
    })
  }

  addCustomTools(item: any) {
    return new ForkPromise(async (resolve) => {
      const data: any = await this.#getToolData()
      if (item?.id) {
        const find = data.custom.find((c: any) => c.id === item.id)
        if (find) {
          Object.assign(find, item)
          await this.#setToolData(data)
          resolve(data)
          return
        }
      }
      item.isCustom = true
      item.id = uuid()
      item.type = 'Custom'
      item.index = 0
      data.custom.unshift(item)
      await this.#setToolData(data)
      resolve(data)
    })
  }

  delCustomTools(item: any) {
    return new ForkPromise(async (resolve) => {
      const data: any = await this.#getToolData()
      let index = data.custom.findIndex((c: any) => c.id === item.id)
      if (index >= 0) {
        data.custom.splice(index, 1)
      }
      index = data.like.findIndex((c: any) => c === item.id)
      if (index >= 0) {
        data.like.splice(index, 1)
      }
      await this.#setToolData(data)
      resolve(data)
    })
  }
}

export default new Manager()
