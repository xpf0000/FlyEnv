import { createReadStream, readFileSync, statSync } from 'fs'
import { Base } from './Base'
import { execPromise, execPromiseRoot, getAllFileAsync, systemProxyGet, uuid } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import {
  copyFile,
  existsSync,
  mkdirp,
  readdir,
  readFile,
  realpathSync,
  remove,
  writeFile
} from 'fs-extra'
import { TaskItem, TaskQueue, TaskQueueProgress } from '@shared/TaskQueue'
import { basename, dirname, join } from 'path'
import { I18nT } from '../lang'
import { zipUnPack } from '@shared/file'
import { EOL } from 'os'
import type { SoftInstalled } from '@shared/app'
import { PItem, ProcessListSearch } from '../Process'

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

  wordSplit(txt: string) {
    return new ForkPromise(async (resolve) => {
      if (!txt.trim()) {
        return resolve([])
      }
      resolve(txt.trim().split(''))
    })
  }

  systemEnvFiles() {
    return new ForkPromise(async (resolve, reject) => {
      const envFiles = [
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
        await execPromise(`echo '${global.Server.Password}' | sudo -S cp -f ${cacheFile} ${file}`)
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

  sslMake(param: { domains: string; root: string; savePath: string }) {
    return new ForkPromise(async (resolve, reject) => {
      const openssl = join(global.Server.AppDir!, 'openssl/bin/openssl.exe')
      if (!existsSync(openssl)) {
        await zipUnPack(join(global.Server.Static!, `zip/openssl.7z`), global.Server.AppDir!)
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
        await execPromiseRoot(command)

        const caCSR = join(param.savePath, `${caFileName}.csr`)

        process.chdir(dirname(openssl))
        command = `${basename(openssl)} req -new -key "${caKey}" -out "${caCSR}" -sha256 -subj "/CN=Dev Root CA ${caFileName}" -config "${opensslCnf}"`
        await execPromiseRoot(command)

        process.chdir(param.savePath)
        command = `echo basicConstraints=CA:true > "${caFileName}.cnf"`
        await execPromiseRoot(command)

        const caCRT = join(param.savePath, `${caFileName}.crt`)
        const caCnf = join(param.savePath, `${caFileName}.cnf`)

        process.chdir(dirname(openssl))
        command = `${basename(openssl)} x509 -req -in "${caCSR}" -signkey "${caKey}" -out "${caCRT}" -extfile "${caCnf}" -sha256 -days 3650`
        await execPromiseRoot(command)
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
      await execPromiseRoot(command)

      process.chdir(dirname(openssl))
      command = `${basename(openssl)} x509 -req -in "${saveCSR}" -out "${saveCrt}" -extfile "${saveExt}" -CA "${caFile}.crt" -CAkey "${caFile}.key" -CAcreateserial -sha256 -days 3650`
      await execPromiseRoot(command)

      const crtFile = join(param.savePath, `${saveName}.crt`)
      if (existsSync(crtFile)) {
        resolve(true)
      } else {
        reject(new Error('SSL Make Failed!'))
      }
    })
  }

  processFind(name: string) {
    return new ForkPromise(async (resolve) => {
      let list: PItem[] = []
      try {
        list = await ProcessListSearch(name, false)
      } catch (e) {}

      const arrs: PItem[] = []

      const findSub = (item: PItem) => {
        const sub: PItem[] = []
        for (const s of list) {
          if (s.ParentProcessId === item.ProcessId) {
            sub.push(s)
          }
        }
        if (sub.length > 0) {
          item.children = sub
        }
      }

      for (const item of list) {
        findSub(item)
        const p = list.find((s: PItem) => s.ProcessId === item.ParentProcessId)
        if (!p) {
          arrs.push(item)
        }
      }

      resolve(arrs)
    })
  }

  processKill(pids: string[]) {
    return new ForkPromise(async (resolve) => {
      const str = pids.map((s) => `/pid ${s}`).join(' ')
      try {
        await execPromiseRoot(`taskkill /f /t ${str}`)
      } catch (e) {}
      resolve(true)
    })
  }

  portFind(name: string) {
    return new ForkPromise(async (resolve) => {
      const command = `netstat -ano | findstr :${name}`
      let res: any
      try {
        res = await execPromiseRoot(command)
      } catch (e) {}
      const lines = res?.stdout?.trim()?.split('\n') ?? []
      const list = lines
        .filter((s: string) => !s.includes(`findstr `))
        .map((i: string) => {
          const all = i
            .split(' ')
            .filter((s: string) => {
              return !!s.trim()
            })
            .map((s) => s.trim())
          if (all[1].endsWith(`:${name}`)) {
            const PID = all.pop()
            return PID
          } else {
            return undefined
          }
        })
        .filter((p: string) => !!p)
      const arr: any[] = []
      const pids = Array.from(new Set(list))

      console.log('pids: ', pids)

      for (const pid of pids) {
        const command = `wmic process get CommandLine,ProcessId | findstr "${pid}"`
        const res = await execPromiseRoot(command)
        const lines = res?.stdout?.trim()?.split('\n') ?? []
        lines
          .filter((s) => !s.includes(`findstr `))
          .forEach((i) => {
            const all = i.split(' ').filter((s: string) => {
              return !!s.trim()
            })
            const PID = all.pop()
            if (PID === pid) {
              const COMMAND = all.join(' ')
              if (!arr.find((a) => a.PID === PID && a.COMMAND === COMMAND)) {
                arr.push({
                  PID,
                  COMMAND
                })
              }
            }
          })
      }
      resolve(arr)
    })
  }

  fetchPATH(): ForkPromise<string[]> {
    return new ForkPromise(async (resolve, reject) => {
      const sh = join(global.Server.Static!, 'sh/path.cmd')
      const copySh = join(global.Server.Cache!, 'path.cmd')
      if (existsSync(copySh)) {
        await remove(copySh)
      }
      await copyFile(sh, copySh)
      process.chdir(global.Server.Cache!)
      try {
        const res = await execPromiseRoot('path.cmd')
        let str = res?.stdout ?? ''
        str = str.replace(new RegExp(`\n`, 'g'), '')
        const oldPath = Array.from(new Set(str.split(';') ?? []))
          .filter((s) => !!s.trim())
          .map((s) => s.trim())
          .map((s) => {
            if (existsSync(s)) {
              return realpathSync(s)
            }
            return s
          })
        console.log('fetchPATH path: ', str, oldPath)
        resolve(oldPath)
      } catch (e) {
        reject(e)
      }
    })
  }

  _fetchRawPATH(): ForkPromise<string[]> {
    return new ForkPromise(async (resolve, reject) => {
      const sh = join(global.Server.Static!, 'sh/path.cmd')
      const copySh = join(global.Server.Cache!, 'path.cmd')
      if (existsSync(copySh)) {
        await remove(copySh)
      }
      await copyFile(sh, copySh)
      process.chdir(global.Server.Cache!)
      try {
        const res = await execPromiseRoot('path.cmd')
        let str = res?.stdout ?? ''
        str = str.replace(new RegExp(`\n`, 'g'), '')
        const oldPath = Array.from(new Set(str.split(';') ?? []))
          .filter((s) => !!s.trim())
          .map((s) => s.trim())
        console.log('_fetchRawPATH: ', str, oldPath)
        resolve(oldPath)
      } catch (e) {
        reject(e)
      }
    })
  }

  updatePATH(item: SoftInstalled, typeFlag: string) {
    return new ForkPromise(async (resolve, reject) => {
      let oldPath: string[] = []
      let rawOldPath: string[] = []
      try {
        oldPath = await this._fetchRawPATH()
        rawOldPath = oldPath.map((s) => {
          if (existsSync(s)) {
            return realpathSync(s)
          }
          return s
        })
      } catch (e) {}
      if (oldPath.length === 0) {
        reject(new Error('Fail'))
        return
      }
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
      try {
        await execPromiseRoot(`rmdir /S /Q ${flagDir}`)
      } catch (e) {
        console.log('rmdir err: ', e)
      }
      if (!rawOldPath.includes(binDir)) {
        try {
          await execPromiseRoot(`mklink /J "${flagDir}" "${item.path}"`)
        } catch (e) {
          console.log('updatePATH mklink err: ', e)
        }
      }

      /**
       * 已存在的 删除
       */
      const index = oldPath.indexOf(binDir)
      if (index >= 0) {
        oldPath.splice(index, 1)
      }

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
          } catch (e) {
            check = false
          }
          return check
        })

      console.log('allFile: ', allFile)
      /**
       * 从原有PATH删除全部env文件夹
       */
      oldPath = oldPath.filter((o) => {
        if (o.includes(envDir)) {
          if (!allFile.find((a) => o.includes(a))) {
            return false
          }
        }
        return true
      })

      if (existsSync(flagDir)) {
        const index = oldPath.findIndex((o) => o.includes(flagDir))
        if (index >= 0) {
          oldPath.splice(index, 1)
        }
        oldPath.unshift(dirname(item.bin.replace(item.path, flagDir)))
      }

      oldPath = oldPath.map((p) => {
        if (p.includes('%')) {
          return p.replace(new RegExp('%', 'g'), '#').replace(new RegExp('#', 'g'), '%%')
        }
        return p
      })

      console.log('oldPath: ', oldPath)

      if (typeFlag === 'composer') {
        const bat = join(binDir, 'composer.bat')
        if (!existsSync(bat)) {
          await writeFile(
            bat,
            `@echo off
php "%~dp0composer.phar" %*`
          )
        }
      }

      const sh = join(global.Server.Static!, 'sh/path-set.cmd')
      const copySh = join(global.Server.Cache!, 'path-set.cmd')
      if (existsSync(copySh)) {
        await remove(copySh)
      }
      let content = await readFile(sh, 'utf-8')
      content = content.replace('##NEW_PATH##', oldPath.join(';'))
      if (typeFlag === 'java') {
        content = content.replace('##OTHER##', `setx /M JAVA_HOME "${item.path}"`)
      } else if (typeFlag === 'erlang') {
        content = content.replace('##OTHER##', `setx /M ERLANG_HOME "${item.path}"`)
        const f = join(global.Server.Cache!, `${uuid()}.ps1`)
        await writeFile(
          f,
          `New-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force`
        )
        process.chdir(global.Server.Cache!)
        try {
          const res = await execPromiseRoot(`powershell.exe "${f}"`)
          console.log('erlang path fix: ', res)
        } catch (e) {}
        await remove(f)
      } else {
        content = content.replace('##OTHER##', ``)
      }
      console.log('updatePATH: ', content)
      await writeFile(copySh, content)
      oldPath = oldPath.map((o) => {
        if (existsSync(o)) {
          return realpathSync(o)
        }
        return o
      })
      process.chdir(global.Server.Cache!)
      try {
        await execPromiseRoot('path-set.cmd')
        resolve(oldPath)
      } catch (e) {
        reject(e)
      }
    })
  }

  updatePATHEXT(ext: string) {
    return new ForkPromise(async (resolve, reject) => {
      let sh = join(global.Server.Static!, 'sh/pathext.cmd')
      let copySh = join(global.Server.Cache!, 'pathext.cmd')
      if (existsSync(copySh)) {
        await remove(copySh)
      }
      await copyFile(sh, copySh)
      process.chdir(global.Server.Cache!)
      let old: string[] = []
      try {
        const res = await execPromiseRoot('pathext.cmd')
        let str = res?.stdout ?? ''
        str = str.replace(new RegExp(`\n`, 'g'), '')
        old = Array.from(new Set(str.split(';') ?? []))
          .filter((s) => !!s.trim())
          .map((s) => s.trim())
        console.log('updatePATHEXT path: ', str, old)
      } catch (e) {
        reject(e)
        return
      }
      if (old.length === 0) {
        reject(new Error('Fail'))
        return
      }
      ext = ext.toUpperCase()
      if (old.includes(ext)) {
        resolve(true)
        return
      }
      old.push(ext)
      sh = join(global.Server.Static!, 'sh/pathext-set.cmd')
      copySh = join(global.Server.Cache!, 'pathext-set.cmd')
      if (existsSync(copySh)) {
        await remove(copySh)
      }
      let content = await readFile(sh, 'utf-8')
      content = content.replace('##NEW_PATHEXT##', old.join(';'))
      console.log('updatePATHEXT: ', content)
      await writeFile(copySh, content)
      process.chdir(global.Server.Cache!)
      try {
        await execPromiseRoot('pathext-set.cmd')
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }
}

export default new Manager()
