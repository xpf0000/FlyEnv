import { ForkPromise } from '@shared/ForkPromise'
import { execPromise, hostAlias } from '../../Fn'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { mkdirp, remove, writeFile } from 'fs-extra'
import { execPromiseRoot } from '@shared/Exec'
import { EOL } from 'os'
import type { AppHost } from '@shared/app'

export const makeAutoSSL = (host: AppHost): ForkPromise<{ crt: string; key: string } | false> => {
  return new ForkPromise(async (resolve) => {
    try {
      const alias = hostAlias(host)
      const CARoot = join(global.Server.BaseDir!, 'CA/PhpWebStudy-Root-CA.crt')
      const CADir = dirname(CARoot)
      const caFileName = 'PhpWebStudy-Root-CA'
      if (!existsSync(CARoot)) {
        await mkdirp(CADir)
        let command = `openssl genrsa -out ${caFileName}.key 2048;`
        command += `openssl req -new -key ${caFileName}.key -out ${caFileName}.csr -sha256 -subj "/CN=${caFileName}";`
        command += `echo "basicConstraints=CA:true" > ${caFileName}.cnf;`
        command += `openssl x509 -req -in ${caFileName}.csr -signkey ${caFileName}.key -out ${caFileName}.crt -extfile ${caFileName}.cnf -sha256 -days 3650;`
        await execPromise(command, {
          cwd: CADir
        })
        if (!existsSync(CARoot)) {
          resolve(false)
          return
        }
        command = `security add-trusted-cert -d -r trustRoot -k "/Library/Keychains/System.keychain" "PhpWebStudy-Root-CA.crt"`
        await execPromiseRoot(command.split(' '), {
          cwd: CADir
        })
        command = `security find-certificate -c "PhpWebStudy-Root-CA"`
        const res = await execPromiseRoot(command.split(' '), {
          cwd: CADir
        })
        if (
          !res.stdout.includes('PhpWebStudy-Root-CA') &&
          !res.stderr.includes('PhpWebStudy-Root-CA')
        ) {
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

      const rootCA = join(CADir, 'PhpWebStudy-Root-CA')

      let command = `openssl req -new -newkey rsa:2048 -nodes -keyout ${hostCAName}.key -out ${hostCAName}.csr -sha256 -subj "/CN=${hostCAName}";`
      command += `openssl x509 -req -in ${hostCAName}.csr -out ${hostCAName}.crt -extfile ${hostCAName}.ext -CA "${rootCA}.crt" -CAkey "${rootCA}.key" -CAcreateserial -sha256 -days 3650;`
      await execPromise(command, {
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
    } catch (e) {
      resolve(false)
    }
  })
}
