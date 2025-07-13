import { BaseManager } from './Base'
import { execPromise } from '../util'

class Manager extends BaseManager {
  sslAddTrustedCert(cwd: string): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      try {
        await execPromise(
          `security add-trusted-cert -d -r trustRoot -k "/Library/Keychains/System.keychain" "FlyEnv-Root-CA.crt"`,
          {
            cwd
          }
        )
      } catch (e) {
        reject(e)
        return
      }
      resolve(true)
    })
  }

  sslFindCertificate(cwd: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const res = await execPromise(`security find-certificate -c "FlyEnv-Root-CA"`, {
          cwd
        })
        resolve({
          stdout: res.stdout,
          stderr: res.stderr
        })
      } catch (e) {
        reject(e)
      }
    })
  }

  dnsRefresh() {
    return new Promise(async (resolve) => {
      try {
        await execPromise(`dscacheutil -flushcache`)
      } catch {}
      try {
        await execPromise(`killall -HUP mDNSResponder`)
      } catch {}
      resolve(true)
    })
  }
}

export default new Manager()
