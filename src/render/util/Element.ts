import { ElMessage } from 'element-plus'

export const MessageSuccess = (msg: string) => {
  ElMessage({
    message: msg,
    type: 'success',
    showClose: true,
    customClass: 'app-el-message'
  })
}

export const MessageError = (msg: string) => {
  ElMessage({
    message: msg,
    type: 'error',
    showClose: true,
    customClass: 'app-el-message'
  })
}

export const MessageWarning = (msg: string) => {
  ElMessage({
    message: msg,
    type: 'warning',
    showClose: true,
    customClass: 'app-el-message'
  })
}
