import { ElMessage } from 'element-plus'

export const MessageSuccess = (msg: string) => {
  ElMessage({
    message: `<div class="wapper">${msg}</div>`,
    dangerouslyUseHTMLString: true,
    type: 'success',
    showClose: true,
    customClass: 'app-el-message',
    zIndex: 99999
  })
}

export const MessageError = (msg: string) => {
  ElMessage({
    message: `<div class="wapper">${msg}</div>`,
    dangerouslyUseHTMLString: true,
    type: 'error',
    showClose: true,
    customClass: 'app-el-message',
    zIndex: 99999
  })
}

export const MessageWarning = (msg: string) => {
  ElMessage({
    message: msg,
    type: 'warning',
    showClose: true,
    customClass: 'app-el-message',
    zIndex: 99999
  })
}
