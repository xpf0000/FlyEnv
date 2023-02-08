import { ElLoading as Loading } from 'element-plus'
import { nextTick, render, App } from 'vue'
import { ElMessageBox as MessageBox } from 'element-plus'
import { ElMessage as Message } from 'element-plus'
import BaseDialog from '../components/YbBaseDialog/dialog'
import { EventBus } from '@/global'

let loading: any
let loadingTxtDom: any

class Base {
  init(app: App) {
    app.config.globalProperties.$destroy = function () {
      render(null, {
        // @ts-ignore
        _vnode: this.$.vnode
      })
    }
    app.config.globalProperties.$baseEventBus = EventBus
    app.config.globalProperties.$baseLoadingClose = this.LoadingClose
    app.config.globalProperties.$baseLoadingText = this.LoadingText
    app.config.globalProperties.$baseLoading = this.Loading
    app.config.globalProperties.$baseMessage = this._Message
    app.config.globalProperties.$baseAlert = this.Alert
    app.config.globalProperties.$baseConfirm = this._Confirm
    app.config.globalProperties.$baseDialog = this.Dialog
    app.config.globalProperties.$message = {
      success: (msg: string) => {
        return this._Message(msg, 'success')
      },
      warning: (msg: string) => {
        return this._Message(msg, 'warning')
      },
      info: (msg: string) => {
        return this._Message(msg, 'info')
      },
      error: (msg: string) => {
        return this._Message(msg, 'error')
      }
    }
  }

  LoadingClose() {
    loading && loading.close()
    loadingTxtDom = null
  }

  LoadingText(str: string) {
    if (loadingTxtDom) {
      loadingTxtDom.innerHTML = str
    }
  }

  Loading(text: string, index?: number) {
    loading && loading.close()
    if (!index) {
      loading = Loading.service({
        lock: true,
        text: text || '加载中...',
        background: 'hsla(0,0%,100%,.8)',
        customClass: 'Base-Loading'
      })
    } else {
      loading = Loading.service({
        lock: true,
        text: text || '加载中...',
        spinner: 'vab-loading-type' + index,
        background: 'hsla(0,0%,100%,.8)',
        customClass: 'Base-Loading'
      })
    }
    nextTick().then(() => {
      const LoadDiv = document.querySelector('.Base-Loading')
      loadingTxtDom = LoadDiv?.querySelector('.el-loading-text')
    })
    return loading
  }

  _Message(message: string, type = 'success') {
    return new Promise((resolve) => {
      Message({
        offset: 60,
        showClose: true,
        message: message,
        // @ts-ignore
        type: type,
        dangerouslyUseHTMLString: true,
        duration: 3000,
        onClose: () => {
          // @ts-ignore
          // eslint-disable-next-line prefer-rest-params
          resolve(...arguments)
        }
      })
    })
  }

  MessageSuccess(message: string) {
    return this._Message(message, 'success')
  }

  MessageWarning(message: string) {
    return this._Message(message, 'warning')
  }

  MessageInfo(message: string) {
    return this._Message(message, 'info')
  }

  MessageError(message: string) {
    return this._Message(message, 'error')
  }

  Alert(content: string, title = '温馨提示') {
    return MessageBox.alert(content, title, {
      confirmButtonText: '确定',
      dangerouslyUseHTMLString: true
    })
  }

  _Confirm(content: string, title: string, param = {}) {
    // @ts-ignore
    return MessageBox.confirm(
      content,
      title || '温馨提示',
      Object.assign(
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          closeOnClickModal: false,
          type: 'warning'
        },
        param
      )
    )
  }

  ConfirmSuccess(content: string, title = '温馨提示') {
    return this._Confirm(content, title, 'success')
  }

  ConfirmError(content: string, title = '温馨提示') {
    return this._Confirm(content, title, 'error')
  }

  ConfirmInfo(content: string, title = '温馨提示') {
    return this._Confirm(content, title, 'info')
  }

  ConfirmWarning(content: string, title = '温馨提示') {
    return this._Confirm(content, title, 'warning')
  }

  Dialog(component: any, data = {}, width = '50%', className = '') {
    const dialog = new BaseDialog(component)
    dialog.data(data)
    dialog.width(width)
    dialog.className(className)
    return dialog
  }
}

export default new Base()
