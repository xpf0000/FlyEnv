import { Base } from '../Base'
import { machineId } from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { arch } from 'os'
import axios from 'axios'
import { publicDecrypt } from 'crypto'
import { isMacOS, isWindows } from '@shared/utils'

class App extends Base {
  constructor() {
    super()
  }

  private getRSAKey() {
    const a = '0+u/eiBrB/DAskp9HnoIgq1MDwwbQRv6rNxiBK/qYvvdXJHKBmAtbe0+SW8clzne'
    const b = 'Kq1BrqQFebPxLEMzQ19yrUyei1nByQwzlX8r3DHbFqE6kV9IcwNh9yeW3umUw05F'
    const c = 'zwIDAQAB'
    const d = 'n7Yl8hRd195GT9h48GsW+ekLj2ZyL/O4rmYRlrNDtEAcDNkI0UG0NlG+Bbn2yN1t'
    const e = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzVJ3axtKGl3lPaUFN82B'
    const f = 'XZW4pCiCvUTSMIU86DkBT/CmDw5n2fCY/FKMQue+WNkQn0mrRphtLH2x0NzIhg+l'
    const g = 'Zkm1wi9pNWLJ8ZvugKZnHq+l9ZmOES/xglWjiv3C7/i0nUtp0sTVNaVYWRapFsTL'
    const arr: string[] = [e, g, b, a, f, d, c]

    const a1 = '-----'
    const a2 = ' PUBLIC KEY'
    const a3 = 'BEGIN'
    const a4 = 'END'

    arr.unshift([a1, a3, a2, a1].join(''))
    arr.push([a1, a4, a2, a1].join(''))

    return arr.join('\n')
  }

  start(version: string) {
    return new ForkPromise(async (resolve, reject) => {
      const uuid_new = await machineId()
      const uuid = '#########'

      let os = ''
      if (isWindows()) {
        os = `Windows ${arch()}`
      } else if (isMacOS()) {
        os = `macOS ${arch()}`
      } else {
        os = `Linux ${arch()}`
      }

      const data = {
        uuid,
        uuid_new,
        os,
        version
      }

      console.log('data: ', data)
      axios({
        url: 'https://api.one-env.com/api/app/start',
        method: 'post',
        data,
        proxy: this.getAxiosProxy()
      })
        .then((res) => {
          if (res?.data?.code === 200) {
            const license = res?.data?.data?.license ?? ''
            resolve({
              'APP-Licenses-Code': license
            })
            return
          }

          resolve(true)
        })
        .catch((err) => {
          reject(err)
        })
    })
  }

  feedback(info: any) {
    return new ForkPromise(async (resolve, reject) => {
      const uuid = await machineId()

      const data = {
        uuid,
        ...info
      }

      console.log('data: ', data)

      axios({
        url: 'https://api.one-env.com/api/app/feedback_app',
        method: 'post',
        data,
        proxy: this.getAxiosProxy()
      })
        .then(() => {
          resolve(true)
        })
        .catch((e) => {
          reject(e)
        })
    })
  }

  licensesInit() {
    return new ForkPromise(async (resolve, reject, on) => {
      const uuid = await machineId()
      const data = {
        requestSuccess: false,
        uuid,
        activeCode: '',
        isActive: false
      }

      this.licensesState()
        .then((res) => {
          Object.assign(data, res)
          data.requestSuccess = true
          on({
            'APP-Licenses-Code': data?.activeCode ?? ''
          })
          resolve(data)
        })
        .catch(() => {
          data.requestSuccess = false
          const license = global.Server?.Licenses
          if (license) {
            const uid = publicDecrypt(
              this.getRSAKey(),
              Buffer.from(license, 'base64') as any
            ).toString('utf-8')
            data.isActive = uid === uuid
            data.activeCode = data.isActive ? license : ''
          }
          resolve(data)
        })
    })
  }

  licensesState() {
    return new ForkPromise(async (resolve, reject, on) => {
      const uuid = await machineId()
      const obj = {
        uuid,
        activeCode: '',
        isActive: false
      }
      axios({
        url: 'https://api.one-env.com/api/app/active_code_info',
        method: 'post',
        data: {
          uuid
        },
        proxy: this.getAxiosProxy()
      })
        .then((res) => {
          console.log('licensesState res: ', res)
          const data = res?.data?.data ?? {}
          obj.activeCode = data?.code ?? ''
          if (obj.activeCode) {
            const uid = publicDecrypt(
              this.getRSAKey(),
              Buffer.from(obj.activeCode, 'base64') as any
            ).toString('utf-8')
            obj.isActive = uid === uuid

            on({
              'APP-Licenses-Code': obj.isActive ? obj.activeCode : ''
            })
          } else {
            on({
              'APP-Licenses-Code': ''
            })
          }
          resolve(obj)
        })
        .catch((e) => {
          console.log('licensesState err: ', e)
          reject(e)
        })
    })
  }

  licensesRequest(message: string) {
    return new ForkPromise(async (resolve, reject) => {
      const uuid = await machineId()
      const user_uuid = global.Server?.UserUUID ?? ''
      axios({
        url: 'https://api.one-env.com/api/app/active_code_request',
        method: 'post',
        data: {
          uuid,
          user_uuid,
          message
        },
        proxy: this.getAxiosProxy()
      })
        .then(() => {
          resolve(true)
        })
        .catch((e) => {
          reject(e)
        })
    })
  }
}

export default new App()
