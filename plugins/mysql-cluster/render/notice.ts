import { ElMessage } from 'element-plus'
const show = (type: 'error' | 'success', message: string) =>
  ElMessage({ message, type, showClose: true, customClass: 'app-el-message', zIndex: 99999 })
export const MessageError = (message: string) => show('error', message)
export const MessageSuccess = (message: string) => show('success', message)
