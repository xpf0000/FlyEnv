import { statSync } from 'fs'
import { Base } from '../Base'
import {
  addPath,
  execPromise,
  fetchRawPATH,
  getAllFileAsync,
  handleWinPathArr,
  isNTFS,
  uuid,
  writePath,
  copyFile,
  existsSync,
  mkdirp,
  readdir,
  readFile,
  realpathSync,
  remove,
  writeFile,
  zipUnpack,
  execPromiseWithEnv
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { TaskQueue, TaskQueueProgress } from '@shared/TaskQueue'
import { basename, dirname, isAbsolute, join, resolve as PathResolve } from 'path'
import { EOL } from 'os'
import type { SoftInstalled } from '@shared/app'
import type { AppServiceAliasItem } from '@shared/app'
import { BomCleanTask } from '../../util/BomCleanTask'
import { ProcessListSearch, ProcessPidList, ProcessPidListByPids } from '@shared/Process.win'
import { PItem, ProcessListByPid } from '@shared/Process'
import RequestTimer from '@shared/requestTimer'
import Helper from '../../Helper'

class Manager extends Base {
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

  wordSplit(txt: string) {
    return new ForkPromise(async (resolve) => {
      if (!txt.trim()) {
        return resolve([])
      }
      resolve(txt.trim().split(''))
    })
  }

  sslMake(param: { domains: string; root: string; savePath: string }) {
    return new ForkPromise(async (resolve, reject) => {
      const openssl = join(global.Server.AppDir!, 'openssl/bin/openssl.exe')
      if (!existsSync(openssl)) {
        await zipUnpack(join(global.Server.Static!, `zip/openssl.7z`), global.Server.AppDir!)
      }
      const opensslCnf = join(global.Server.AppDir!, 'openssl/openssl.cnf')
      if (!existsSync(opensslCnf)) {
        await copyFile(join(global.Server.Static!, 'tmpl/openssl.cnf'), opensslCnf)
      }
      const domains = param.domains
        .split('\n')
        .map((item) => {
          return item.trim()
        })
        .filter((item) => {
          return item && item.length > 0
        })
      const saveName = uuid(6) + '.' + domains[0].replace('*.', '')
      let caFile = param.root
      let caFileName = basename(caFile)
      if (caFile.length === 0) {
        caFile = join(param.savePath, uuid(6) + '.RootCA.crt')
        caFileName = basename(caFile)
      }
      caFile = caFile.replace('.crt', '')
      caFileName = caFileName.replace('.crt', '')

      if (!existsSync(caFile + '.crt')) {
        const caKey = join(param.savePath, `${caFileName}.key`)

        process.chdir(dirname(openssl))
        let command = `${basename(openssl)} genrsa -out "${caKey}" 2048`
        await execPromise(command)

        const caCSR = join(param.savePath, `${caFileName}.csr`)

        process.chdir(dirname(openssl))
        command = `${basename(openssl)} req -new -key "${caKey}" -out "${caCSR}" -sha256 -subj "/CN=Dev Root CA ${caFileName}" -config "${opensslCnf}"`
        await execPromise(command)

        process.chdir(param.savePath)

        const caCRT = join(param.savePath, `${caFileName}.crt`)
        const caCnf = join(param.savePath, `${caFileName}.cnf`)

        const cnf = `basicConstraints = critical,CA:TRUE
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer`
        await writeFile(caCnf, cnf)

        process.chdir(dirname(openssl))
        command = `${basename(openssl)} x509 -req -in "${caCSR}" -signkey "${caKey}" -out "${caCRT}" -extfile "${caCnf}" -sha256 -days 3650`
        await execPromise(command)
      }

      let ext = `authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName=@alt_names

[alt_names]${EOL}`
      domains.forEach((item, index) => {
        ext += `DNS.${index + 1} = ${item}${EOL}`
      })
      ext += `IP.1 = 127.0.0.1${EOL}`
      await writeFile(join(param.savePath, `${saveName}.ext`), ext)

      const saveKey = join(param.savePath, `${saveName}.key`)
      const saveCSR = join(param.savePath, `${saveName}.csr`)
      const saveCrt = join(param.savePath, `${saveName}.crt`)
      const saveExt = join(param.savePath, `${saveName}.ext`)

      process.chdir(dirname(openssl))
      let command = `${basename(openssl)} req -new -newkey rsa:2048 -nodes -keyout "${saveKey}" -out "${saveCSR}" -sha256 -subj "/CN=${saveName}" -config "${opensslCnf}"`
      await execPromise(command)

      process.chdir(dirname(openssl))
      command = `${basename(openssl)} x509 -req -in "${saveCSR}" -out "${saveCrt}" -extfile "${saveExt}" -CA "${caFile}.crt" -CAkey "${caFile}.key" -CAcreateserial -sha256 -days 3650`
      await execPromise(command)

      const crtFile = join(param.savePath, `${saveName}.crt`)
      if (existsSync(crtFile)) {
        resolve(true)
      } else {
        reject(new Error('SSL Make Failed!'))
      }
    })
  }

  getPidsByKey(name: string) {
    return new ForkPromise(async (resolve) => {
      let list: PItem[] = []
      try {
        list = await ProcessListSearch(name, false)
      } catch {}

      const arrs: PItem[] = []

      const findSub = (item: PItem) => {
        const sub: PItem[] = []
        for (const s of list) {
          if (s.PPID === item.PID) {
            sub.push(s)
          }
        }
        if (sub.length > 0) {
          item.children = sub
        }
      }

      for (const item of list) {
        findSub(item)
        const p = list.find((s: PItem) => s.PID === item.PPID)
        if (!p) {
          arrs.push(item)
        }
      }

      resolve(arrs)
    })
  }

  killPids(sig: string, pids: Array<string>) {
    return new ForkPromise(async (resolve) => {
      try {
        await Helper.send('tools', 'kill', '-INT', pids)
      } catch {}
      resolve(true)
    })
  }

  getPortPids(name: string) {
    return new ForkPromise(async (resolve) => {
      let pids: string[] = []
      try {
        pids = (await Helper.send('tools', 'getPortPidsWin', name)) as any
      } catch {}
      pids = Array.from(new Set(pids))
      pids = pids
        .map((m) => m.trim())
        .filter((p) => {
          return !!p && p !== '0'
        })
      if (pids.length === 0) {
        return resolve([])
      }
      const arr: any[] = []
      console.log('pids: ', pids)
      const all = await ProcessPidList()
      for (const pid of pids) {
        const item = ProcessListByPid(pid, all)
        arr.push(...item)
      }
      resolve(arr)
    })
  }

  killPorts(ports: Array<string>) {
    return new ForkPromise(async (resolve) => {
      const list: string[] = []
      for (const port of ports) {
        let portList: string[] = []
        try {
          portList = (await Helper.send('tools', 'getPortPidsWin', port)) as any
        } catch {
          portList = []
        }
        list.push(...portList)
      }

      const pids = Array.from(new Set(list))
      if (pids.length === 0) {
        return resolve(true)
      }
      console.log('pids: ', pids)
      const all = await ProcessPidListByPids(pids)
      if (!all.length) {
        return resolve(true)
      }
      try {
        await Helper.send('tools', 'kill', '-INT', all)
      } catch {}
      resolve(true)
    })
  }

  fetchPATH(): ForkPromise<string[]> {
    return new ForkPromise(async (resolve) => {
      const res: any = {
        allPath: [],
        appPath: []
      }
      const pathArr = await fetchRawPATH()
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

  removePATH(item: SoftInstalled, typeFlag: string) {
    return new ForkPromise(async (resolve, reject) => {
      let oldPath: string[] = []
      try {
        oldPath = await fetchRawPATH()
      } catch {}
      if (oldPath.length === 0) {
        reject(new Error('Fail'))
        return
      }

      console.log('removePATH oldPath 0: ', oldPath)

      const envDir = join(dirname(global.Server.AppDir!), 'env')
      const flagDir = join(envDir, typeFlag)
      let hasError = false
      try {
        await remove(flagDir)
      } catch {
        hasError = true
      }
      if (hasError) {
        try {
          await Helper.send('tools', 'rm', flagDir)
        } catch (e) {
          console.log('rmdir err: ', e)
        }
      }
      console.log('removePATH flagDir: ', flagDir)

      oldPath = oldPath.filter((p) => {
        const a = p.includes(flagDir)
        const b = p.includes(item.path)
        if (a || b) {
          return false
        }
        let res = true
        if (isAbsolute(p)) {
          try {
            const realPath = realpathSync(p)
            if (realPath.includes(flagDir) || realPath.includes(item.path)) {
              res = false
            }
          } catch {}
        }
        return res
      })

      console.log('removePATH oldPath 1: ', oldPath)

      oldPath = oldPath.filter((p) => !p.startsWith(item.path))

      console.log('removePATH oldPath 2: ', oldPath)

      const dirIndex = oldPath.findIndex((s) => isAbsolute(s))
      const varIndex = oldPath.findIndex((s) => !isAbsolute(s))
      if (varIndex < dirIndex && dirIndex > 0) {
        const dir = oldPath[dirIndex]
        oldPath.splice(dirIndex, 1)
        oldPath.unshift(dir)
      }

      if (typeFlag === 'composer') {
        oldPath = oldPath.filter(
          (s) =>
            !s.includes('%COMPOSER_HOME%\\vendor\\bin') &&
            !s.includes('%APPDATA%\\Composer\\vendor\\bin')
        )
      }

      oldPath = handleWinPathArr(oldPath)

      console.log('removePATH oldPath 3: ', oldPath)

      const pathString = oldPath
      try {
        await writePath(pathString, '')
      } catch (e) {
        return reject(e)
      }

      const allPath = await this.fetchPATH()
      resolve(allPath)
    })
  }

  updatePATH(item: SoftInstalled, typeFlag: string) {
    return new ForkPromise(async (resolve, reject) => {
      let oldPath: string[] = []
      let rawOldPath: string[] = []
      try {
        oldPath = await fetchRawPATH()
        rawOldPath = oldPath.map((s) => {
          if (existsSync(s)) {
            return realpathSync(s)
          }
          return s
        })
      } catch {}
      if (oldPath.length === 0) {
        reject(new Error('Fail'))
        return
      }
      console.log('oldPath 001: ', oldPath)
      console.log('rawOldPath: ', rawOldPath)

      const binDir = dirname(item.bin)
      /**
       * 初始化env文件夾
       * 删除标识文件夹
       * 如果原来没有 重新创建链接文件夹
       */
      const envDir = join(dirname(global.Server.AppDir!), 'env')
      if (!existsSync(envDir)) {
        await mkdirp(envDir)
      }
      const flagDir = join(envDir, typeFlag)
      console.log('flagDir: ', flagDir)
      let hasError = false
      try {
        await remove(flagDir)
      } catch {
        hasError = true
      }
      if (hasError) {
        try {
          await Helper.send('tools', 'rm', flagDir)
        } catch (e) {
          console.log('rmdir err: ', e)
        }
      }

      if (!rawOldPath.includes(binDir)) {
        try {
          await execPromise(`mklink /J "${flagDir}" "${item.path}"`)
        } catch (e) {
          console.log('updatePATH mklink err: ', e)
        }
      }

      /**
       * 过滤掉此item
       */
      oldPath = oldPath.filter((o) => {
        const a = existsSync(o) && realpathSync(o).startsWith(item.path)
        return !a
      })

      /**
       * 获取env文件夹下所有子文件夹
       */
      let allFile = await readdir(envDir)
      allFile = allFile
        .filter((f) => existsSync(join(envDir, f)))
        .map((f) => join(envDir, f))
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

      console.log('oldPath 002: ', oldPath)
      console.log('allFile: ', allFile)

      /**
       * 从原有PATH删除全部env文件夹
       */
      oldPath = oldPath.filter((o) => !o.includes(envDir))

      /**
       * 非NTFS的 无法创建软链接。allFile应该时空的。直接push item
       */
      if (!(await isNTFS(envDir)) || !(await isNTFS(item.path))) {
        allFile.push(item.path)
      }

      for (const envPath of allFile) {
        const rawEnvPath = realpathSync(envPath)
        /**
         * 从原有的oldPath过滤掉
         * 1. 文本地址包含软链接的
         * 2. 文本地址包含真实路径的
         * 3. 真实地址包含软链接或者真实路径的
         */
        oldPath = oldPath.filter((p) => {
          const a = p.includes(envPath)
          const b = p.includes(rawEnvPath)
          if (a || b) {
            return false
          }
          let res = true
          if (isAbsolute(p)) {
            try {
              const realPath = realpathSync(p)
              if (realPath.includes(envPath) || realPath.includes(rawEnvPath)) {
                res = false
              }
            } catch {}
          }
          return res
        })

        /**
         * 添加路径
         */
        oldPath.unshift(envPath)
        if (existsSync(join(envPath, 'bin'))) {
          oldPath.unshift(join(envPath, 'bin'))
        }
        if (existsSync(join(envPath, 'sbin'))) {
          oldPath.unshift(join(envPath, 'sbin'))
        }
        if (existsSync(join(envPath, 'python.exe'))) {
          const pip = join(envPath, 'Scripts/pip.exe')
          if (existsSync(pip)) {
            oldPath.unshift(dirname(pip))
          }
        }
      }

      if (typeFlag === 'composer') {
        const bat = join(binDir, 'composer.bat')
        if (!existsSync(bat)) {
          await writeFile(
            bat,
            `@echo off
php "%~dp0composer.phar" %*`
          )
        }
        let composer_bin_dir = ''
        try {
          const d = await execPromise(`echo %COMPOSER_HOME%\\Composer`)
          composer_bin_dir = d?.stdout?.trim()
          console.log('d: ', d)
        } catch {}
        if (composer_bin_dir && isAbsolute(composer_bin_dir)) {
          oldPath.push(`%COMPOSER_HOME%\\vendor\\bin`)
        } else {
          try {
            const d = await execPromise(`echo %APPDATA%\\Composer`)
            composer_bin_dir = d?.stdout?.trim()
            console.log('d: ', d)
          } catch {}
          if (composer_bin_dir && isAbsolute(composer_bin_dir)) {
            oldPath.push(`%APPDATA%\\Composer\\vendor\\bin`)
          }
        }
      }

      oldPath = handleWinPathArr(oldPath)

      console.log('oldPath 003: ', oldPath)

      const pathString = oldPath
      let otherString = ''
      if (typeFlag === 'java') {
        otherString = `"JAVA_HOME" = "${flagDir}"`
      } else if (typeFlag === 'gradle') {
        otherString = `"GRADLE_HOME" = "${flagDir}"`
      } else if (typeFlag === 'erlang') {
        otherString = `"ERLANG_HOME" = "${flagDir}"`
        const f = join(global.Server.Cache!, `${uuid()}.ps1`)
        await writeFile(
          f,
          `New-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force`
        )
        process.chdir(global.Server.Cache!)
        try {
          await execPromise(
            `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath '${f}'; & '${f}'"`
          )
        } catch {}
        await remove(f)
      }

      try {
        await writePath(pathString, otherString)
      } catch (e) {
        return reject(e)
      }

      if (typeFlag === 'php') {
        const phpModule = (await import('../Php.win')).default
        try {
          await phpModule.getIniPath(item)
        } catch {}
      }

      const allPath = await this.fetchPATH()
      resolve(allPath)
    })
  }

  private async removeFixed(dir: string) {
    let hasError = false
    try {
      await remove(dir)
    } catch {
      hasError = true
    }
    if (hasError) {
      try {
        await Helper.send('tools', 'rm', dir)
      } catch {}
    }
  }

  setAlias(
    service: SoftInstalled,
    item: AppServiceAliasItem | undefined,
    old: AppServiceAliasItem | undefined,
    alias: Record<string, AppServiceAliasItem[]>
  ) {
    return new ForkPromise(async (resolve) => {
      const aliasDir = PathResolve(global.Server.BaseDir!, '../alias')
      await mkdirp(aliasDir)
      if (old?.id) {
        const oldFile = join(aliasDir, `${old.name}.bat`)
        if (existsSync(oldFile)) {
          await this.removeFixed(oldFile)
        }
        const index = alias?.[service.bin]?.findIndex((a) => a.id === old.id)
        if (index >= 0) {
          alias[service.bin].splice(index, 1)
        }
      }

      if (item) {
        const file = join(aliasDir, `${item.name}.bat`)
        if (item?.php?.bin) {
          const bin = item?.php?.bin?.replace('php-cgi.exe', 'php.exe')
          const content = `@echo off
chcp 65001>nul
"${bin}" "${service.bin}" %*`
          await writeFile(file, content)
        } else {
          const bin = service.bin.replace('php-cgi.exe', 'php.exe')
          const content = `@echo off
chcp 65001>nul
"${bin}" %*`
          await writeFile(file, content)
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

      try {
        await Helper.send('tools', 'exec', `setx /M FLYENV_ALIAS "${aliasDir}"`)
      } catch {}

      await addPath('%FLYENV_ALIAS%')

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
            const file = join(aliasDir, `${i.name}.bat`)
            if (existsSync(file)) {
              await this.removeFixed(file)
            }
          }
          delete alias[bin]
        } else {
          const arr: AppServiceAliasItem[] = []
          for (const i of item) {
            if (i?.php?.bin && !existsSync(i?.php?.bin)) {
              const file = join(aliasDir, `${i.name}.bat`)
              if (existsSync(file)) {
                await this.removeFixed(file)
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

  envPathList() {
    return new ForkPromise(async (resolve, reject) => {
      console.log('envPathList !!!!!')
      let oldPath: string[] = []
      try {
        oldPath = await fetchRawPATH()
      } catch {}
      if (oldPath.length === 0) {
        reject(new Error('Fail'))
        return
      }
      const list: any = []
      for (const p of oldPath) {
        let raw = ''
        let error = false
        if (isAbsolute(p)) {
          try {
            raw = realpathSync(p)
            error = !existsSync(raw)
          } catch {
            error = true
          }
        } else if (p.includes('%') || p.includes('$env:')) {
          try {
            raw = (await execPromise(`echo ${p}`))?.stdout?.trim() ?? ''
            error = !raw || !existsSync(raw)
          } catch {
            error = true
          }
        }
        list.push({
          path: p,
          raw,
          error
        })
      }
      resolve(list)
    })
  }

  envPathUpdate(arr: string[]) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await writePath(arr)
      } catch (e) {
        console.log('envPathUpdate err: ', e)
        return reject(e)
      }
      resolve(true)
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
    return new ForkPromise(async (resolve, reject) => {
      command = JSON.stringify(command).slice(1, -1)
      console.log('command: ', command)
      try {
        await execPromiseWithEnv(`start powershell -NoExit -Command "${command}"`)
      } catch (e) {
        return reject(e)
      }
      resolve(true)
    })
  }

  openPathByApp(
    dir: string,
    app:
      | 'PowerShell'
      | 'PowerShell7'
      | 'PhpStorm'
      | 'WebStorm'
      | 'IntelliJ'
      | 'PyCharm'
      | 'RubyMine'
      | 'GoLand'
      | 'HBuilderX'
      | 'RustRover'
  ) {
    return new ForkPromise(async (resolve, reject) => {
      let command = ''
      const JetBrains = [
        'PhpStorm',
        'WebStorm',
        'IntelliJ',
        'PyCharm',
        'RubyMine',
        'GoLand',
        'RustRover'
      ]
      if (JetBrains.includes(app)) {
        const findIdePath = async (ideName: string) => {
          try {
            // 定义所有可能的注册表路径
            const registryPaths = [
              `HKLM\\SOFTWARE\\JetBrains\\${ideName}`,
              `HKLM\\SOFTWARE\\WOW6432Node\\JetBrains\\${ideName}`,
              `HKCU\\SOFTWARE\\JetBrains\\${ideName}`
            ]

            for (const regPath of registryPaths) {
              try {
                // 使用 /s 参数查询所有子项和值
                const { stdout } = await execPromiseWithEnv(`reg query "${regPath}" /s`)
                const lines = stdout.split('\n').map((line: string) => line.trim())

                let basePath = null

                for (const line of lines) {
                  if (line.includes('InstallPath') || line.includes('(Default)')) {
                    const pathMatch = line.match(/(InstallPath|\(Default\))\s+REG_SZ\s+(.+)/i)
                    if (pathMatch) {
                      basePath = pathMatch[2].trim()
                      break // 找到路径后退出循环
                    }
                  }
                }

                if (basePath) {
                  return formatExePath(basePath, ideName)
                }
              } catch {
                continue
              }
            }

            return null
          } catch (error) {
            console.error(`Error finding IDE path: ${error}`)
            return null
          }
        }

        const findToolboxIdePath = async (ideName: string) => {
          try {
            // 尝试获取 Toolbox 安装目录
            const { stdout } = await execPromiseWithEnv(
              `reg query "HKCU\\SOFTWARE\\JetBrains\\Toolbox" /v "InstallDir"`
            )
            const match = stdout.match(/InstallDir\s+REG_SZ\s+(.+)/i)
            if (!match) return null

            const toolboxPath = match[1].trim()
            const appsPath = `${toolboxPath}\\apps\\${ideName}\\ch-0`

            // 获取最新版本目录（按修改时间倒序）
            const { stdout: dirs } = await execPromiseWithEnv(`dir "${appsPath}" /AD /B /O-N`)
            const latestVersionDir = dirs.split('\r\n')[0].trim()
            if (!latestVersionDir) return null

            return formatExePath(`${appsPath}\\${latestVersionDir}`, ideName)
          } catch (error) {
            console.error(`Error finding Toolbox IDE path: ${error}`)
            return null
          }
        }

        // 统一格式化可执行文件路径
        const formatExePath = (basePath: string, ideName: string) => {
          const exeMap: Record<string, string> = {
            phpstorm: 'phpstorm64.exe',
            pycharm: 'pycharm64.exe',
            intellijidea: 'idea64.exe',
            webstorm: 'webstorm64.exe',
            clion: 'clion64.exe',
            rider: 'rider64.exe',
            goland: 'goland64.exe',
            datagrip: 'datagrip64.exe',
            rubymine: 'rubymine64.exe',
            appcode: 'appcode64.exe'
          }

          const normalizedName = ideName.toLowerCase()
          const exeName = exeMap[normalizedName] || `${normalizedName}64.exe`
          const exePath = `${basePath}\\bin\\${exeName}`

          if (existsSync(exePath)) {
            return exePath
          }
          return null
        }

        const openWithIde = async (ideName: string, folderPath: string) => {
          try {
            let idePath = await findIdePath(ideName)
            if (!idePath) {
              idePath = await findToolboxIdePath(ideName)
            }

            if (!idePath) {
              console.error(`${ideName} not found`)
              return false
            }

            await execPromiseWithEnv(`"${idePath}" "${folderPath}"`)
            console.log(`Opened ${folderPath} with ${ideName}`)
            return true
          } catch (error) {
            console.error(`Error opening IDE: ${error}`)
            return false
          }
        }

        const res = await openWithIde(app, dir)
        if (res) {
          return resolve(true)
        }
        return reject(new Error(`${app} Not Found`))
      }
      if (app === 'HBuilderX') {
        const getHBuilderXPath = async (): Promise<string | null> => {
          try {
            // 查询注册表
            const { stdout } = await execPromiseWithEnv(
              `reg query "HKCR\\hbuilderx\\shell\\open\\command" /ve`
            )

            // 提取路径（示例输出: "(Default) REG_SZ "D:\Program Files\HBuilderX\HBuilderX.exe" "%1""）
            const match = stdout.match(/"(.*?HBuilderX\.exe)"/i)
            if (match && match[1]) {
              return match[1] // 返回可执行文件完整路径
            }
            return null
          } catch {
            return null
          }
        }
        const openWithHBuilderX = async (targetPath: string): Promise<boolean> => {
          try {
            const hbuilderxPath = await getHBuilderXPath()
            if (!hbuilderxPath) {
              return false
            }
            await execPromiseWithEnv(`"${hbuilderxPath}" "${targetPath}"`)
            return true
          } catch {
            return false
          }
        }

        const res = await openWithHBuilderX(dir)
        if (res) {
          return resolve(true)
        }
        return reject(new Error(`HBuilderX Not Found`))
      }
      if (app === 'PowerShell') {
        command = `cd "${dir}"`
        command = JSON.stringify(command).slice(1, -1)
        command = `start powershell -NoExit -Command "${command}"`
      } else if (app === 'PowerShell7') {
        command = `cd "${dir}"`
        command = JSON.stringify(command).slice(1, -1)
        command = `start pwsh.exe -NoExit -Command "${command}"`
      }
      try {
        await execPromiseWithEnv(command)
      } catch (e) {
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
    return new ForkPromise(async (resolve) => {
      const psVersions = [
        { name: 'PowerShell 5.1', exe: 'powershell.exe', profileType: 'CurrentUserCurrentHost' },
        { name: 'PowerShell 7+', exe: 'pwsh.exe', profileType: 'CurrentUserAllHosts' }
      ]

      const flyenvScriptPath = join(dirname(global.Server.AppDir!), 'bin/flyenv.ps1')
      await mkdirp(dirname(flyenvScriptPath))
      await copyFile(join(global.Server.Static!, 'sh/fly-env.ps1'), flyenvScriptPath)

      for (const version of psVersions) {
        try {
          const profilePath = (
            await execPromiseWithEnv(`$PROFILE.${version.profileType}`, { shell: version.exe })
          ).stdout.trim()

          if (!profilePath || profilePath === '') continue

          // 写入配置（如果不存在）
          await mkdirp(dirname(profilePath))
          const loadCommand = `. "${flyenvScriptPath.replace(/\\/g, '/')}"\n`

          if (!existsSync(profilePath)) {
            await writeFile(profilePath, `# FlyEnv Auto-Load\n${loadCommand}`)
          } else {
            const content = await readFile(profilePath, 'utf-8')
            if (!content.includes(loadCommand.trim())) {
              await writeFile(
                profilePath,
                `${content.trim()}\n\n# FlyEnv Auto-Load\n${loadCommand}`
              )
            }
          }
        } catch (err) {
          console.log('initFlyEnvSH err: ', err)
        }
      }
      try {
        await execPromiseWithEnv(
          `if ((Get-ExecutionPolicy -Scope CurrentUser) -eq 'Restricted') {
  Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
}`,
          { shell: 'powershell.exe' }
        )
      } catch {}

      resolve(true)
    })
  }
}

export default new Manager()
