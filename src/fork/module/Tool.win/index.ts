import { Base } from '../Base'
import {
  execPromise,
  getAllFileAsync,
  uuid,
  copyFile,
  existsSync,
  writeFile,
  zipUnpack,
  execPromiseWithEnv,
  spawnPromiseWithEnv
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { TaskQueue, TaskQueueProgress } from '@shared/TaskQueue'
import { basename, dirname, join } from 'path'
import { EOL } from 'os'
import { BomCleanTask } from '../../util/BomCleanTask'
import RequestTimer from '@shared/requestTimer'
import { getPidsByKey, killPids, getPortPids, killPorts } from './process'
import { fetchPATH, removePATH, updatePATH, envPathList, envPathUpdate } from './path'
import { setAlias, cleanAlias } from './alias'
import { openPathByApp } from './ide'
import { initAllowDir, initFlyEnvSH } from './init'
import EnvSync from '@shared/EnvSync'

const quotePowerShellSingle = (value: string) => {
  return `'${value.replace(/'/g, "''")}'`
}

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
      command = `${basename(openssl)} x509 -req -in "${saveCSR}" -out "${saveCrt}" -extfile "${saveExt}" -CA "${caFile}.crt" -CAkey "${caFile}.key" -CAcreateserial -CAserial "${caFile}.srl" -sha256 -days 3650`
      await execPromise(command)

      const crtFile = join(param.savePath, `${saveName}.crt`)
      if (existsSync(crtFile)) {
        resolve(true)
      } else {
        reject(new Error('SSL Make Failed!'))
      }
    })
  }

  getPidsByKey = getPidsByKey
  killPids = killPids
  getPortPids = getPortPids
  killPorts = killPorts

  fetchPATH = fetchPATH
  removePATH = removePATH
  updatePATH = updatePATH

  setAlias = setAlias
  cleanAlias = cleanAlias

  envPathList = envPathList
  envPathUpdate = envPathUpdate

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

  openPathByApp = openPathByApp

  initAllowDir = initAllowDir
  initFlyEnvSH = initFlyEnvSH

  openSysdmCpl() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await EnvSync.sync()
        const systemPath = EnvSync.SystemPath ?? 'C:\\Windows\\System32'
        const powershell =
          EnvSync.PowerShellPath ?? join(systemPath, 'WindowsPowerShell/v1.0/powershell.exe')
        const rundll32 = join(systemPath, 'rundll32.exe')
        const sysdm = join(systemPath, 'sysdm.cpl')
        const command = `Start-Process -FilePath ${quotePowerShellSingle(rundll32)} -ArgumentList ${quotePowerShellSingle(`${sysdm},EditEnvironmentVariables`)} -Verb RunAs`
        await spawnPromiseWithEnv(
          powershell,
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
          {
            windowsHide: true
          }
        )
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }
}

export default new Manager()
