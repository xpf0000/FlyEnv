import { ForkPromise } from '@shared/ForkPromise'
import { hostAlias, execPromiseRoot } from '../../Fn'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { copyFile, mkdirp, remove, writeFile } from 'fs-extra'
import { EOL } from 'os'
import type { AppHost } from '@shared/app'
import { zipUnPack } from '@shared/file'

const initCARoot = () => {
  return new Promise(async (resolve) => {
    const CARoot = join(global.Server.BaseDir!, 'CA/PhpWebStudy-Root-CA.crt')
    const command = `certutil -addstore root "${CARoot}"`
    try {
      const res = await execPromiseRoot(command)
      console.log('initCARoot res111: ', res)
    } catch (e) {}
    resolve(true)
  })
}

export const makeAutoSSL = (host: AppHost): ForkPromise<{ crt: string; key: string } | false> => {
  return new ForkPromise(async (resolve) => {
    try {
      const alias = hostAlias(host)
      const CARoot = join(global.Server.BaseDir!, 'CA/PhpWebStudy-Root-CA.crt')
      const CADir = dirname(CARoot)
      if (!existsSync(CARoot)) {
        await mkdirp(CADir)
        await zipUnPack(join(global.Server.Static!, `zip/CA.7z`), CADir)
        await initCARoot()
      }

      const openssl = join(global.Server.AppDir!, 'openssl/bin/openssl.exe')
      if (!existsSync(openssl)) {
        await zipUnPack(join(global.Server.Static!, `zip/openssl.7z`), global.Server.AppDir!)
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

      const rootCA = join(CADir, 'PhpWebStudy-Root-CA')

      const opensslCnf = join(global.Server.AppDir!, 'openssl/openssl.cnf')
      if (!existsSync(opensslCnf)) {
        await copyFile(join(global.Server.Static!, 'tmpl/openssl.cnf'), opensslCnf)
      }

      process.chdir(dirname(openssl))
      const caKey = join(hostCADir, `${hostCAName}.key`)
      const caCSR = join(hostCADir, `${hostCAName}.csr`)
      let command = `openssl.exe req -new -newkey rsa:2048 -nodes -keyout "${caKey}" -out "${caCSR}" -sha256 -subj "/CN=${hostCAName}" -config "${opensslCnf}"`
      console.log('command: ', command)
      await execPromiseRoot(command)

      process.chdir(dirname(openssl))
      const caCRT = join(hostCADir, `${hostCAName}.crt`)
      const caEXT = join(hostCADir, `${hostCAName}.ext`)
      command = `openssl.exe x509 -req -in "${caCSR}" -out "${caCRT}" -extfile "${caEXT}" -CA "${rootCA}.crt" -CAkey "${rootCA}.key" -CAcreateserial -sha256 -days 3650`
      console.log('command: ', command)
      await execPromiseRoot(command)

      const crt = join(hostCADir, `${hostCAName}.crt`)
      if (!existsSync(crt)) {
        resolve(false)
        return
      }
      resolve({
        crt,
        key: join(hostCADir, `${hostCAName}.key`)
      })
    } catch (e) {
      resolve(false)
    }
  })
}
