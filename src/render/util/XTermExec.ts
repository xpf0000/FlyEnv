import { nextTick } from 'vue'
import XTerm from '@/util/XTerm'
import { AppStore } from '@/store/app'
import type { CallbackFn } from '@shared/app'

class XTermExec {
  id: string = ''
  execEnd: boolean = false
  execing: boolean = false
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
    if (this.execing) {
      return
    }
    this.execEnd = false
    this.execing = true
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
    await execXTerm.send(params, false)
    this.execEnd = true
    for (const fn of this._callbackFn) {
      fn(true)
    }
    this._callbackFn.splice(0)
  }

  async show(dom: HTMLElement, cammand: string) {
    if (this.execing) {
      return
    }
    this.execing = true
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
    if (params.length > 0) {
      for (const c of params) {
        execXTerm.writeToNodePty(`${c}\r`)
      }
    }
    execXTerm.writeToNodePty(cammand)
  }

  mount(dom: HTMLElement) {
    this.xterm?.mount?.(dom)?.catch()
  }

  unmount() {
    this.xterm?.unmounted?.()
  }

  taskConfirm() {
    this.execing = false
    this.execEnd = false
    this.xterm?.destroy()
    delete this.xterm
    if (XTermExecCache?.[this.id]) {
      delete XTermExecCache[this.id]
    }
  }

  taskCancel() {
    this.execing = false
    this.execEnd = false
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
