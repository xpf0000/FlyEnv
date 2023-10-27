import axios from 'axios'
axios.defaults.withCredentials = true
const instance = axios.create()
export default instance
