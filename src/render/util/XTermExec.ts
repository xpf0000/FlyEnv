import { nextTick } from 'vue'
import XTerm from '@/util/XTerm'
import { AppStore } from '@/store/app'
import type { CallbackFn } from '@shared/app'

class XTermExec {
  id: string = ''
  installEnd: boolean = false
  installing: boolean = false
  xterm: XTerm | undefined
  cammand: string[] = []
  title: string = ''

  private _callbackFn: CallbackFn[] = []
  private _cancelCallbackFn: CallbackFn[] = []

  wait() {
    return new Promise((resolve) => {
      this._callbackFn.push(resolve)
    })
  }

  whenCancel() {
    return new Promise((resolve) => {
      this._cancelCallbackFn.push(resolve)
    })
  }

  async exec(dom: HTMLElement, cammand: string[]) {
    if (this.installing) {
      return
    }
    this.installEnd = false
    this.installing = true
    await nextTick()
    const execXTerm = new XTerm()
    this.xterm = execXTerm
    await execXTerm.mount(dom)
    const params: string[] = []

    if (window.Server.isWindows) {
      if (window.Server.Proxy) {
        for (const k in window.Server.Proxy) {
          const v = window.Server.Proxy[k]
          params.push(`$env:${k}="${v}"`)
        }
      }
    } else {
      const appStore = AppStore()
      const proxy = appStore.config.setup?.proxy?.proxy
      if (proxy) {
        params.push(proxy)
      }
    }
    params.push(...cammand)
    await execXTerm.send(params)
    this.installEnd = true
    for (const fn of this._callbackFn) {
      fn(true)
    }
    this._callbackFn.splice(0)
  }

  mount(dom: HTMLElement) {
    this.xterm?.mount?.(dom)?.catch()
  }

  unmount() {
    this.xterm?.unmounted?.()
  }

  taskConfirm() {
    this.installing = false
    this.installEnd = false
    this.xterm?.destroy()
    delete this.xterm
    if (XTermExecCache?.[this.id]) {
      delete XTermExecCache[this.id]
    }
  }

  taskCancel() {
    this.installing = false
    this.installEnd = false
    this.xterm?.stop()?.then(() => {
      this.xterm?.destroy()
      delete this.xterm
      if (XTermExecCache?.[this.id]) {
        delete XTermExecCache[this.id]
      }
      for (const fn of this._cancelCallbackFn) {
        fn()
      }
      this._cancelCallbackFn.splice(0)
    })
  }
}

const XTermExecCache: Record<string, XTermExec> = {}

export { XTermExec, XTermExecCache }
