import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import axios from 'axios'
import http from 'http'
import https from 'https'

class Ai extends Base {
  constructor() {
    super()
    this.type = 'ai'
  }

  allLang() {
    return new ForkPromise(async (resolve) => {
      let list: any = []
      try {
        const res = await axios({
          url: 'https://api.one-env.com/api/ai/lang_list_all',
          method: 'post',
          timeout: 30000,
          withCredentials: false,
          httpAgent: new http.Agent({ keepAlive: false }),
          httpsAgent: new https.Agent({ keepAlive: false }),
          proxy: this.getAxiosProxy()
        })
        list = res?.data?.data?.[0] ?? []
      } catch (e) {
        console.log('allPrompt: err', e)
      }
      resolve(list)
    })
  }

  allPrompt() {
    return new ForkPromise(async (resolve) => {
      let list: any = []
      try {
        const res = await axios({
          url: 'https://api.one-env.com/api/ai/prompt_list_all',
          method: 'post',
          timeout: 30000,
          withCredentials: false,
          httpAgent: new http.Agent({ keepAlive: false }),
          httpsAgent: new https.Agent({ keepAlive: false }),
          proxy: this.getAxiosProxy()
        })
        list = res?.data?.data?.[0] ?? []
      } catch (e) {
        console.log('allPrompt: err', e)
      }
      resolve(list)
    })
  }
}
export default new Ai()
