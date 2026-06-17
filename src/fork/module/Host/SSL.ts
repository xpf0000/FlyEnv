import { ForkPromise } from '@shared/ForkPromise'
import {
  copyFile,
  execPromiseWithEnv,
  hostAlias,
  mkdirp,
  remove,
  writeFile,
  zipUnpack
} from '../../Fn'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { EOL } from 'os'
import type { AppHost } from '@shared/app'
import Helper from '../../Helper'
import { appDebugLog, isWindows } from '@shared/utils'

// Mutex tail for certificate issuance — see makeAutoSSL. (#700)
let sslQueue: Promise<unknown> = Promise.resolve()

const initCARoot = () => {
  return new Promise(async (resolve) => {
    const CARoot = join(global.Server.BaseDir!, 'CA/FlyEnv-Root-CA.crt')
    const CADir = dirname(CARoot)
    try {
      const res = await Helper.send('host', 'sslAddTrustedCert', CADir, 'FlyEnv-Root-CA.crt')
      console.log('initCARoot res111: ', res)
    } catch {}
    resolve(true)
  })
}

export const makeAutoSSL = (host: AppHost): ForkPromise<{ crt: string; key: string } | false> => {
  // Serialize all certificate issuance. Without this, batch site creation
  // (park / Promise.all over many hosts) races on (a) first-time Root CA
  // generation and (b) the shared CA serial (.srl) file, producing a
  // corrupted root CA or duplicate serial numbers. (#700)
  const run = sslQueue.then(() => _makeAutoSSL(host))
  // Keep the queue alive regardless of individual success/failure.
  sslQueue = run.then(
    () => undefined,
    () => undefined
  )
  return new ForkPromise<{ crt: string; key: string } | false>((resolve) => {
    run.then(resolve).catch(() => resolve(false))
  })
}

const _makeAutoSSL = (host: AppHost): ForkPromise<{ crt: string; key: string } | false> => {
  return new ForkPromise(async (resolve) => {
    try {
      const alias = hostAlias(host)
      const CARoot = join(global.Server.BaseDir!, 'CA/FlyEnv-Root-CA.crt')
      const CADir = dirname(CARoot)
      const hostCADir = join(CADir, `${host.id}`)
      const rootCA = join(CADir, 'FlyEnv-Root-CA')
      const caFileName = 'FlyEnv-Root-CA'

      if (isWindows()) {
        const openssl = join(global.Server.AppDir!, 'openssl/bin/openssl.exe')
        if (!existsSync(openssl)) {
          await zipUnpack(join(global.Server.Static!, `zip/openssl.7z`), global.Server.AppDir!)
        }
        const opensslCnf = join(global.Server.AppDir!, 'openssl/openssl.cnf')
        if (!existsSync(opensslCnf)) {
          await copyFile(join(global.Server.Static!, 'tmpl/openssl.cnf'), opensslCnf)
        }

        if (!existsSync(CARoot)) {
          await mkdirp(CADir)
          let command = `"${openssl}" genrsa -out ${caFileName}.key 2048`
          await execPromiseWithEnv(command, {
            cwd: CADir
          })
          command = `"${openssl}" req -new -key ${caFileName}.key -out ${caFileName}.csr -sha256 -subj "/CN=${caFileName}" -config "${opensslCnf}"`
          await execPromiseWithEnv(command, {
            cwd: CADir
          })
          const cnf = `basicConstraints = critical,CA:TRUE
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer`
          await writeFile(join(CADir, `${caFileName}.cnf`), cnf)
          command = `"${openssl}" x509 -req -in ${caFileName}.csr -signkey ${caFileName}.key -out ${caFileName}.crt -extfile ${caFileName}.cnf -sha256 -days 3650`
          await execPromiseWithEnv(command, {
            cwd: CADir
          })
          if (!existsSync(CARoot)) {
            resolve(false)
            return
          }
          await initCARoot()
        }

        const hostCAName = `CA-${host.id}`

        if (existsSync(hostCADir)) {
          await remove(hostCADir)
        }
        await mkdirp(hostCADir)
        let ext = `authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName=@alt_names

[alt_names]${EOL}`
        alias.forEach((item, index) => {
          ext += `DNS.${index + 1} = ${item}${EOL}`
        })
        ext += `IP.1 = 127.0.0.1${EOL}`
        await writeFile(join(hostCADir, `${hostCAName}.ext`), ext)

        // Call openssl by full path with an explicit cwd instead of mutating
        // the whole fork process working dir via process.chdir (which has a
        // global side effect and races under concurrent issuance). (#700)
        const caKey = join(hostCADir, `${hostCAName}.key`)
        const caCSR = join(hostCADir, `${hostCAName}.csr`)
        let command = `"${openssl}" req -new -newkey rsa:2048 -nodes -keyout "${caKey}" -out "${caCSR}" -sha256 -subj "/CN=${hostCAName}" -config "${opensslCnf}"`
        console.log('command: ', command)
        await execPromiseWithEnv(command, { cwd: hostCADir })

        const caCRT = join(hostCADir, `${hostCAName}.crt`)
        const caEXT = join(hostCADir, `${hostCAName}.ext`)
        command = `"${openssl}" x509 -req -in "${caCSR}" -out "${caCRT}" -extfile "${caEXT}" -CA "${rootCA}.crt" -CAkey "${rootCA}.key" -CAcreateserial -CAserial "${rootCA}.srl" -sha256 -days 3650`
        console.log('command: ', command)
        await execPromiseWithEnv(command, { cwd: hostCADir })

        const crt = join(hostCADir, `${hostCAName}.crt`)
        if (!existsSync(crt)) {
          resolve(false)
          return
        }
        resolve({
          crt,
          key: join(hostCADir, `${hostCAName}.key`)
        })
      } else {
        if (!existsSync(CARoot)) {
          await mkdirp(CADir)
          let command = `openssl genrsa -out ${caFileName}.key 2048;`
          command += `openssl req -new -key ${caFileName}.key -out ${caFileName}.csr -sha256 -subj "/CN=${caFileName}";`
          command += `echo "basicConstraints = critical,CA:TRUE\nkeyUsage = critical,keyCertSign,cRLSign\nsubjectKeyIdentifier = hash\nauthorityKeyIdentifier = keyid:always,issuer" > ${caFileName}.cnf;`
          command += `openssl x509 -req -in ${caFileName}.csr -signkey ${caFileName}.key -out ${caFileName}.crt -extfile ${caFileName}.cnf -sha256 -days 3650;`
          await execPromiseWithEnv(command, {
            cwd: CADir
          })
          if (!existsSync(CARoot)) {
            resolve(false)
            return
          }
          try {
            await Helper.send('host', 'sslAddTrustedCert', CADir, `${caFileName}.crt`)
          } catch {}

          const res: any = await Helper.send('host', 'sslFindCertificate', CADir)
          if (!res.stdout.includes('FlyEnv-Root-CA') && !res.stderr.includes('FlyEnv-Root-CA')) {
            resolve(false)
            return
          }
        }
        const hostCAName = `CA-${host.id}`
        const hostCADir = join(CADir, `${host.id}`)
        if (existsSync(hostCADir)) {
          await remove(hostCADir)
        }
        await mkdirp(hostCADir)
        let ext = `authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName=@alt_names

[alt_names]${EOL}`
        alias.forEach((item, index) => {
          ext += `DNS.${index + 1} = ${item}${EOL}`
        })
        ext += `IP.1 = 127.0.0.1${EOL}`
        await writeFile(join(hostCADir, `${hostCAName}.ext`), ext)

        let command = `openssl req -new -newkey rsa:2048 -nodes -keyout ${hostCAName}.key -out ${hostCAName}.csr -sha256 -subj "/CN=${hostCAName}";`
        command += `openssl x509 -req -in ${hostCAName}.csr -out ${hostCAName}.crt -extfile ${hostCAName}.ext -CA "${rootCA}.crt" -CAkey "${rootCA}.key" -CAcreateserial -CAserial "${rootCA}.srl" -sha256 -days 3650;`
        console.log('makeAutoSSL command: ', command)
        await execPromiseWithEnv(command, {
          cwd: hostCADir
        })
        const crt = join(hostCADir, `${hostCAName}.crt`)
        if (!existsSync(crt)) {
          resolve(false)
          return
        }
        resolve({
          crt,
          key: join(hostCADir, `${hostCAName}.key`)
        })
      }
    } catch (e) {
      await appDebugLog('[makeAutoSSL][error]', `${e}`)
      console.log('makeAutoSSL error: ', e)
      resolve(false)
    }
  })
}
