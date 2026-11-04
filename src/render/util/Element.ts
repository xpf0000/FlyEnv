import { ElMessage } from 'element-plus'
import { I18nT } from '@lang/index'
import { formatHelperConnectionErrorMessage } from '@shared/WindowsHelperState'

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
    message: `<div class="wapper">${formatHelperConnectionErrorMessage(msg, I18nT('menu.needInstallHelper'))}</div>`,
    dangerouslyUseHTMLString: true,
    type: 'error',
    showClose: true,
    customClass: 'app-el-message',
    zIndex: 99999
  })
}

export const MessageWarning = (msg: string) => {
  ElMessage({
    message: formatHelperConnectionErrorMessage(msg, I18nT('menu.needInstallHelper')),
    type: 'warning',
    showClose: true,
    customClass: 'app-el-message',
    zIndex: 99999
  })
}
