import axios from 'axios'
axios.defaults.withCredentials = true
const instance = axios.create()
instance.defaults.timeout = 5000
export default instance
