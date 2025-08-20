import { realpathSync, statSync } from 'fs'
import { Base } from '../Base'
import {
  getAllFileAsync,
  uuid,
  systemProxyGet,
  writeFileByRoot,
  readFileByRoot,
  execPromise,
  appendFile,
  chmod,
  copyFile,
  existsSync,
  mkdirp,
  readdir,
  readFile,
  remove,
  writeFile
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { TaskQueue, TaskQueueProgress } from '@shared/TaskQueue'
import { join, dirname, resolve as PathResolve, basename } from 'path'
import { I18nT } from '@lang/index'
import type { AppServiceAliasItem, SoftInstalled } from '@shared/app'
import Helper from '../../Helper'
import { ProcessSearch } from '@shared/Process'
import RequestTimer from '@shared/requestTimer'
import { spawn } from 'child_process'
import { userInfo } from 'os'
import { BomCleanTask } from '../../util/BomCleanTask'
import { defaultShell, isMacOS } from '@shared/utils'

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
        reject(new Error(I18nT('php.phpiniNotFound')))
        return
      }
      try {
        await Helper.send('tools', 'writeFileByRoot', file, content)
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
      } catch {}
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
      const file = join(global.Server.UserHome!, isMacOS() ? '.zshrc' : '.bashrc')
      if (!existsSync(file)) {
        try {
          await writeFile(file, '')
        } catch {}
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
      const regex3 = new RegExp(`^(?!\\s*#)\\s*export\\s*GRADLE_HOME\\s*=\\s*"(.*?)"`, 'gmu')
      const regexArr = [regex, regex2, regex3]
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
        } catch {}
      }
      resolve(true)
    })
  }

  updatePATH(item: SoftInstalled, flag: string) {
    return new ForkPromise(async (resolve, reject) => {
      // Get the PATH environment variable array. Real absolute path array.
      const all = (await this.fetchPATH()).allPath
      // Path of the installed software
      const binPath = dirname(join(item.path, 'bin'))
      const envDir = join(dirname(global.Server.AppDir!), 'env')
      if (!existsSync(envDir)) {
        await mkdirp(envDir)
      }
      // Subfolder under the `env` folder for `flag` (e.g., 'php', 'nginx', 'mysql', etc.)
      const flagDir = join(envDir, flag)
      // Delete the subfolder
      try {
        await Helper.send('tools', 'rm', flagDir)
      } catch {}
      // If the PATH environment variable array does not include the installed software path, create a symlink
      if (!all.includes(binPath)) {
        try {
          await execPromise(['ln', '-s', `"${binPath}"`, `"${flagDir}"`].join(' '))
        } catch {}
      }
      // Get all subfolders under the `env` folder (e.g., 'php', 'nginx', 'mysql', etc.)
      let allFile = await readdir(envDir)
      // Get valid paths
      allFile = allFile
        .filter((f) => existsSync(join(envDir, f)))
        .map((f) => join(envDir, f))
        // Only keep paths that exist and are directories
        .filter((f) => {
          let check = false
          try {
            const rf = realpathSync(f)
            check = existsSync(rf) && statSync(rf).isDirectory()
          } catch {
            check = false
          }
          return check
        })
        .map((f) => {
          const arr: string[] = [f]
          if (existsSync(join(f, 'bin'))) {
            arr.push(join(f, 'bin'))
          } else if (existsSync(join(f, 'sbin'))) {
            arr.push(join(f, 'sbin'))
          }
          return arr
        })
        .flat()

      const aliasDir = PathResolve(global.Server.BaseDir!, '../alias')
      const param: { zsh: string } = {
        zsh: ''
      }
      if (allFile.length > 0) {
        // Handle Java path and add JAVA_HOME variable
        let java = allFile.find(
          (f) =>
            (f.toLowerCase().includes('java') || f.toLowerCase().includes('jdk')) &&
            realpathSync(f).includes('/Contents/Home/')
        )
        let other_zsh = ''
        if (java) {
          java = dirname(realpathSync(java))
          other_zsh = `\nexport JAVA_HOME="${java}"`
        }
        let gradle = allFile.find((f) => {
          const files = [join(f, 'gradle'), join(f, 'bin/gradle')]
          return files.some((s) => existsSync(s))
        })
        if (gradle) {
          gradle = dirname(realpathSync(gradle))
          other_zsh = `\nexport GRADLE_HOME="${gradle}"`
        }
        // Handle Python
        let python = allFile.find((f) => realpathSync(f).includes('Python.framework'))
        if (python) {
          python = realpathSync(python)
          const py = join(python, 'python')
          const py3 = join(python, 'python3')
          if (existsSync(py3) && !existsSync(py)) {
            try {
              await Helper.send('tools', 'ln_s', py3, py)
            } catch {}
          }
        }
        param.zsh = `\nexport PATH="${aliasDir}:${allFile.join(':')}:$PATH"${other_zsh}\n`
      } else {
        param.zsh = `\nexport PATH="${aliasDir}:$PATH"\n`
      }
      try {
        // Write to the .zshrc file
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
        const shell = defaultShell()
        const file = join(aliasDir, `${item.name}`)
        if (item?.php?.bin) {
          const content = `${shell}
"${item?.php?.bin}" "${service.bin}" $@`
          await writeFile(file, content)
          await chmod(file, '0777')
        } else {
          let bin = service.bin
          if (service.typeFlag === 'php') {
            bin = service?.phpBin ?? join(service.path, 'bin/php')
          }
          const content = `${shell}
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

      const zshrc = join(global.Server.UserHome!, isMacOS() ? '.zshrc' : '.bashrc')
      if (!existsSync(zshrc)) {
        try {
          await writeFile(zshrc, '')
        } catch {}
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
      } catch {}
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

  killPorts(ports: Array<string>) {
    return new ForkPromise(async (resolve) => {
      try {
        await Helper.send('tools', 'killPorts', ports)
      } catch {}
      resolve(true)
    })
  }

  killPids(sig: string, pids: Array<string>) {
    return new ForkPromise(async (resolve) => {
      try {
        await Helper.send('tools', 'kill', sig, pids)
      } catch {}
      resolve(true)
    })
  }

  readFileByRoot(file: string) {
    return new ForkPromise(async (resolve) => {
      let content = ''
      try {
        content = (await Helper.send('tools', 'readFileByRoot', file)) as any
      } catch {}
      resolve(content)
    })
  }

  writeFileByRoot(file: string, content: string) {
    return new ForkPromise(async (resolve) => {
      try {
        await Helper.send('tools', 'writeFileByRoot', file, content)
      } catch {}
      resolve(true)
    })
  }

  getPortPids(port: string) {
    return new ForkPromise(async (resolve) => {
      let arr: any
      try {
        arr = await Helper.send('tools', 'getPortPids', port)
      } catch {}
      resolve(arr)
    })
  }

  getPidsByKey(key: string) {
    return new ForkPromise(async (resolve) => {
      let arr: any = []
      try {
        const plist: any = await Helper.send('tools', 'processList')
        arr = ProcessSearch(key, false, plist)
      } catch {}
      resolve(arr)
    })
  }

  requestTimeFetch(url: string) {
    return new ForkPromise(async (resolve, reject) => {
      const timer = new RequestTimer({
        timeout: 10000,
        retries: 2,
        followRedirects: true,
        maxRedirects: 10,
        keepAlive: true,
        strictSSL: false // Set to false to ignore SSL errors
      })
      try {
        const results = await timer.measure(url)
        const res = RequestTimer.formatResults(results)
        resolve(res)
      } catch (error) {
        reject(error)
      }
    })
  }

  runInTerminal(command: string) {
    return new ForkPromise((resolve, reject) => {
      // 转义命令中的特殊字符
      command = command.replace(/"/g, '\\"')
      const appleScript = `
        tell application "Terminal"
          if not running then
            activate
            do script "${command}" in front window
          else
            activate
            do script "${command}"
          end if
        end tell`

      let error: any = undefined
      const osa = spawn('osascript', ['-e', appleScript])
      osa.on('error', (err) => {
        error = err
      })
      osa.on('close', () => {
        console.log('close !!!')
        if (error) {
          reject(error)
        } else {
          resolve(true)
        }
      })
    })
  }

  openPathByApp(dir: string, app: 'Terminal') {
    return new ForkPromise(async (resolve, reject) => {
      let appleScript = ''
      if (app === 'Terminal') {
        appleScript = `tell application "Terminal"
  if not running then
    activate
    do script "cd " & quoted form of "${dir}" in front window
  else
    activate
    do script "cd " & quoted form of "${dir}"
  end if
end tell`
      }
      const scptFile = join(global.Server.Cache!, `${uuid()}.scpt`)
      await writeFile(scptFile, appleScript)
      await chmod(scptFile, '0777')
      try {
        await execPromise(`osascript ./${basename(scptFile)}`, {
          cwd: global.Server.Cache!
        })
        await remove(scptFile)
      } catch (e) {
        await remove(scptFile)
        return reject(e)
      }
      resolve(true)
    })
  }

  initAllowDir(json: string) {
    return new ForkPromise(async (resolve) => {
      const jsonFile = join(dirname(global.Server.AppDir!), 'bin/.flyenv.dir')
      await mkdirp(dirname(jsonFile))
      await writeFile(jsonFile, json)
      resolve(true)
    })
  }

  initFlyEnvSH() {
    return new ForkPromise(async (resolve, reject) => {
      const file = join(global.Server.UserHome!, isMacOS() ? '.zshrc' : '.bashrc')
      if (!existsSync(file)) {
        try {
          await writeFile(file, '')
        } catch {}
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
      const contentBack = content

      const shfile = `/Applications/FlyEnv.app/Contents/Resources/helper/flyenv.sh`
      if (!existsSync(shfile)) {
        const fileContent = await readFile(join(global.Server.Static!, 'sh/fly-env.sh'), 'utf-8')
        try {
          await Helper.send('tools', 'writeFileByRoot', shfile, fileContent)
        } catch {}
        if (existsSync(shfile)) {
          const uinfo = userInfo()
          const user = `${uinfo.uid}:${uinfo.gid}`
          try {
            await Helper.send('tools', 'chmod', shfile, '777')
            await Helper.send('redis', 'logFileFixed', shfile, user)
          } catch {}
        }
      }

      const regex = new RegExp(
        `^(?!\\s*#)\\s*source\\s*"/Applications/FlyEnv\\.app/Contents/Resources/helper/flyenv\\.sh"`,
        'gmu'
      )
      if (!content.match(regex) && existsSync(file)) {
        content = content.trim() + `\nsource "${shfile}"`
      }
      if (content !== contentBack) {
        try {
          await writeFileByRoot(file, content)
        } catch {}
      }
      resolve(true)
    })
  }
}

export default new Manager()
