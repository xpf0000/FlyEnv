import { ElMessage, ElMessageBox } from 'element-plus'
import { t } from './lang'
const show = (type: 'error' | 'success', message: string) =>
  ElMessage({ message, type, showClose: true, customClass: 'app-el-message', zIndex: 99999 })
export const MessageError = (message: string) => show('error', message)
export const MessageSuccess = (message: string) => show('success', message)

let errorDialog: Promise<unknown> | undefined
export function MessageErrorDialog(message: string): Promise<unknown> {
  if (errorDialog) return errorDialog
  errorDialog = ElMessageBox.alert(message, t('error'), {
    confirmButtonText: t('confirm'),
    type: 'error',
    customClass: 'mc-error-dialog',
    closeOnClickModal: false,
    dangerouslyUseHTMLString: false
  })
    .catch(() => undefined)
    .finally(() => {
      errorDialog = undefined
    })
  return errorDialog
}
