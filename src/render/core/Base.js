import { ElLoading as Loading } from 'element-plus'
import { nextTick, render } from 'vue'
import { ElMessageBox as MessageBox } from 'element-plus'
import { ElMessage as Message } from 'element-plus'
import BaseDialog from '../components/YbBaseDialog/dialog.js'
import { EventBus } from '../global.js'
let loading
let loadingTxtDom

class Base {
  init(app) {
    app.config.globalProperties.$destroy = function () {
      render(null, {
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
      success: (msg) => {
        return this._Message(msg, 'success')
      },
      warning: (msg) => {
        return this._Message(msg, 'warning')
      },
      info: (msg) => {
        return this._Message(msg, 'info')
      },
      error: (msg) => {
        return this._Message(msg, 'error')
      }
    }
  }

  LoadingClose() {
    loading && loading.close()
    loadingTxtDom = null
  }

  LoadingText(str) {
    if (loadingTxtDom) {
      loadingTxtDom.innerHTML = str
    }
  }

  Loading(text, index) {
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
      loadingTxtDom = LoadDiv.querySelector('.el-loading-text')
    })
    return loading
  }

  _Message(message, type = 'success') {
    return new Promise((resolve) => {
      Message({
        offset: 60,
        showClose: true,
        message: message,
        type: type,
        dangerouslyUseHTMLString: true,
        duration: 3000,
        onClose: () => {
          resolve(...arguments)
        }
      })
    })
  }

  MessageSuccess(message) {
    return this._Message(message, 'success')
  }

  MessageWarning(message) {
    return this._Message(message, 'warning')
  }

  MessageInfo(message) {
    return this._Message(message, 'info')
  }

  MessageError(message) {
    return this._Message(message, 'error')
  }

  Alert(content, title = '温馨提示') {
    return MessageBox.alert(content, title, {
      confirmButtonText: '确定',
      dangerouslyUseHTMLString: true
    })
  }

  _Confirm(content, title, param = {}) {
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

  ConfirmSuccess(content, title = '温馨提示') {
    return this._Confirm(content, title, 'success')
  }

  ConfirmError(content, title = '温馨提示') {
    return this._Confirm(content, title, 'error')
  }

  ConfirmInfo(content, title = '温馨提示') {
    return this._Confirm(content, title, 'info')
  }

  ConfirmWarning(content, title = '温馨提示') {
    return this._Confirm(content, title, 'warning')
  }

  Dialog(component, data = {}, width = '50%', className = '') {
    let dialog = new BaseDialog(component)
    dialog.data(data)
    dialog.width(width)
    dialog.className(className)
    return dialog
  }
}

export default new Base()
