import { Base } from './Base'
import { getMac } from '@lzwme/get-physical-address'
import { ForkPromise } from '@shared/ForkPromise'
import { cpus, arch } from 'os'
import { md5 } from '../Fn'
import axios from 'axios'

class App extends Base {
  constructor() {
    super()
  }

  start(version: string) {
    return new ForkPromise(async (resolve) => {
      const mac = await getMac()
      const cpu = cpus()?.pop()?.model ?? ''
      const uuid = md5(`${mac}-${cpu}`)
      const os = `macOS ${arch()}`

      const data = {
        uuid,
        os,
        version
      }

      console.log('data: ', data)

      await axios({
        url: 'https://api.macphpstudy.com/api/app/start',
        method: 'post',
        data,
        proxy: this.getAxiosProxy()
      })

      resolve(true)
    })
  }
}

export default new App()
