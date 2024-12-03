import { Base } from './Base'
import { getMac } from '@lzwme/get-physical-address'
import { ForkPromise } from '@shared/ForkPromise'
import { cpus, arch } from 'os'
import { md5 } from '../Fn'
import axios from 'axios'
import { publicDecrypt } from 'crypto'

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

  private async getUUID() {
    const mac = await getMac()
    const cpu = cpus()?.pop()?.model ?? ''
    return md5(`${mac}-${cpu}`)
  }

  start(version: string) {
    return new ForkPromise(async (resolve) => {
      const uuid = await this.getUUID()
      const os = `macOS ${arch()}`

      const data = {
        uuid,
        os,
        version
      }

      console.log('data: ', data)

      await axios({
        url: 'https://api.one-env.com/api/app/start',
        method: 'post',
        data,
        proxy: this.getAxiosProxy()
      })

      resolve(true)
    })
  }

  feedback(info: any) {
    return new ForkPromise(async (resolve, reject) => {
      const uuid = await this.getUUID()

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
      const uuid = await this.getUUID()
      const data = {
        uuid,
        activeCode: '',
        isActive: false
      }
      if (!global.Server.Licenses) {
        const res: any = await this.licensesState()
        console.log('licensesInit licensesState: ', res)
        Object.assign(data, res)
      } else {
        data.activeCode = global.Server.Licenses
        const uid = publicDecrypt(
          this.getRSAKey(),
          Buffer.from(data.activeCode, 'base64')
        ).toString('utf-8')
        data.isActive = uid === uuid
      }
      if (data.activeCode) {
        on({
          'APP-Licenses-Code': data.activeCode
        })
      }
      resolve(data)
    })
  }

  licensesState() {
    return new ForkPromise(async (resolve, reject, on) => {
      const uuid = await this.getUUID()
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
          const data = res?.data?.data ?? {}
          obj.activeCode = data?.code ?? ''
        })
        .catch(() => {})
        .finally(() => {
          if (obj.activeCode) {
            const uid = publicDecrypt(
              this.getRSAKey(),
              Buffer.from(obj.activeCode, 'base64')
            ).toString('utf-8')
            obj.isActive = uid === uuid

            if (obj.activeCode) {
              on({
                'APP-Licenses-Code': obj.activeCode
              })
            }
          }
          resolve(obj)
        })
    })
  }

  licensesRequest(message: string) {
    return new ForkPromise(async (resolve, reject) => {
      const uuid = await this.getUUID()

      axios({
        url: 'https://api.one-env.com/api/app/active_code_request',
        method: 'post',
        data: {
          uuid,
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
