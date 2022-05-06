import axios from 'axios'
let baseHeaders = {
  'Content-Type': 'application/json;charset=UTF-8'
}
axios.defaults.withCredentials = true
axios.defaults.baseURL = 'https://mb.ybvips.cn/'

const instance = axios.create({
  timeout: 60000,
  headers: baseHeaders
})

instance.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

instance.interceptors.response.use(
  (response) => {
    const { data } = response
    const { code } = data
    // 操作正常Code数组
    const codeVerificationArray = [200, 0]
    // 是否操作正常
    if (codeVerificationArray.includes(code)) {
      return data
    } else {
      return Promise.reject(data)
    }
  },
  (error) => {
    return Promise.reject(error)
  }
)

export default instance
