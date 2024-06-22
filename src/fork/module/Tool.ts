import { createReadStream, readFileSync } from 'fs'
import { Base } from './Base'
import { getAllFileAsync, execPromise, uuid, systemProxyGet, execPromiseRoot } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { existsSync, writeFile } from 'fs-extra'
import { TaskQueue, TaskItem, TaskQueueProgress } from '@shared/TaskQueue'
import { join, basename } from 'path'
import { I18nT } from '../lang'
import { zipUnPack } from '@shared/file'
import { EOL } from 'os'

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

  sslMake(param: {
    domains: string
    root: string
    savePath: string
  }) {
    return new ForkPromise(async (resolve, reject) => {
      const openssl = join(global.Server.AppDir!, 'openssl/bin/openssl.exe')
      if (!existsSync(openssl)) {
        await zipUnPack(join(global.Server.Static!, `zip/openssl.7z`), global.Server.AppDir!)
      }
      let domains = param.domains
          .split('\n')
          .map((item) => {
            return item.trim()
          })
          .filter((item) => {
            return item && item.length > 0
          })
        let saveName = uuid(6) + '.' + domains[0].replace('*.', '')
        let caFile = param.root
        let caFileName = basename(caFile)
        if (caFile.length === 0) {
          caFile = join(param.savePath, uuid(6) + '.RootCA.crt')
          caFileName = basename(caFile)
        }
        caFile = caFile.replace('.crt', '')
        caFileName = caFileName.replace('.crt', '')
        
        if (!existsSync(caFile + '.crt')) {
          try {
            process.chdir(param.savePath);
          } catch (err) {}
          let command = `${openssl} genrsa -out ${caFileName}.key 2048`
          await execPromiseRoot(command)

          try {
            process.chdir(param.savePath);
          } catch (err) {}
          command = `${openssl} req -new -key ${caFileName}.key -out ${caFileName}.csr -sha256 -subj "/CN=Dev Root CA ${caFileName}"`
          await execPromiseRoot(command)

          try {
            process.chdir(param.savePath);
          } catch (err) {}
          command = `echo basicConstraints=CA:true > ${caFileName}.cnf`
          await execPromiseRoot(command)

          try {
            process.chdir(param.savePath);
          } catch (err) {}
          command = `${openssl} x509 -req -in ${caFileName}.csr -signkey ${caFileName}.key -out ${caFileName}.crt -extfile ${caFileName}.cnf -sha256 -days 3650`
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

        try {
          process.chdir(param.savePath);
        } catch (err) {}
        let command = `${openssl} req -new -newkey rsa:2048 -nodes -keyout ${saveName}.key -out ${saveName}.csr -sha256 -subj "/CN=${saveName}"`
        await execPromiseRoot(command)

        try {
          process.chdir(param.savePath);
        } catch (err) {}
        command = `${openssl} x509 -req -in ${saveName}.csr -out ${saveName}.crt -extfile ${saveName}.ext -CA "${caFile}.crt" -CAkey "${caFile}.key" -CAcreateserial -sha256 -days 3650`
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
      const command = `wmic process get commandline,ProcessId | findstr "${name}"`
      const res = await execPromiseRoot(command)
      const lines = res?.stdout?.trim()?.split('\n') ?? []
      const list = lines.filter(s => !s.includes(`findstr `)).map((i) => {
        const all = i.split(' ').filter((s: string) => {
          return !!s.trim()
        })
        const PID = all.pop()
        const COMMAND = all.join(' ')
        return {
          PID,
          COMMAND
        }
      })
      resolve(list)
    })
  }

  processKill(pids: string[]) {
    return new ForkPromise(async (resolve) => {
      for (const pid of pids) {
        try {
          await execPromiseRoot(`wmic process where processid="${pid}" delete`)
        } catch (e) {}
      }
      resolve(true)
    })
  }

  portFind(name: string) {
    return new ForkPromise(async (resolve) => {
      const command = `netstat -ano | findstr :${name}`
      const res = await execPromiseRoot(command)
      const lines = res?.stdout?.trim()?.split('\n') ?? []
      const list = lines.filter(s => !s.includes(`findstr `)).map((i) => {
        const all = i.split(' ').filter((s: string) => {
          return !!s.trim()
        }).map(s => s.trim())
        if (all[1].endsWith(`:${name}`)) {
          const PID = all.pop()
          return PID
        } else {
          return undefined
        }
      }).filter(p => !!p)
      const arr: any[] = []
      const pids = Array.from(new Set(list))

      console.log('pids: ', pids)

      for (const pid of pids) {
        const command = `wmic process get commandline,ProcessId | findstr "${pid}"`
      const res = await execPromiseRoot(command)
      const lines = res?.stdout?.trim()?.split('\n') ?? []
      lines.filter(s => !s.includes(`findstr `)).forEach((i) => {
        const all = i.split(' ').filter((s: string) => {
          return !!s.trim()
        })
        const PID = all.pop()
        if (PID === pid) {
          const COMMAND = all.join(' ')
          if (!arr.find(a => a.PID === PID && a.COMMAND === COMMAND)) {
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
}

export default new Manager()
