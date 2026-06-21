import { Base } from '../Base'
import { machineId } from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { arch } from 'os'
import axios from 'axios'
import { appDebugLog, isMacOS, isWindows } from '@shared/utils'

class App extends Base {
  constructor() {
    super()
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
      // Always return active license state for unrestricted usage
      resolve({
        'APP-Licenses-Code': 'VALID_LICENSE_PLACEHOLDER'
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
      let uuid = ''
      try {
        uuid = await machineId()
      } catch (e) {
        appDebugLog(`[machineId][error]`, `${e}`).catch()
      }
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
          // Always treat as active for unrestricted usage
          data.isActive = true
          data.activeCode = 'VALID_LICENSE_PLACEHOLDER'
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
      // Always return active state for unrestricted usage
      obj.activeCode = 'VALID_LICENSE_PLACEHOLDER'
      obj.isActive = true

      on({
        'APP-Licenses-Code': obj.isActive ? obj.activeCode : ''
      })
      resolve(obj)
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