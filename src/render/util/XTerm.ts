import '@xterm/xterm/css/xterm.css'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import IPC from './IPC'
import { AppStore } from '@/store/app'

const { nativeTheme } = require('@electron/remote')

interface HistoryType {
  cammand: string
  cammands: Array<string>
}

interface XTermType {
  xterm: Terminal | undefined
  dom: HTMLElement | undefined
  index: number
  historyIndex: number
  history: Array<HistoryType>
  cammand: Array<string>
}

class XTerm implements XTermType {
  xterm: Terminal | undefined
  dom: HTMLElement | undefined
  cammand: Array<string>
  history: Array<HistoryType>
  historyIndex: number
  index: number
  fitaddon: FitAddon | undefined
  _callBack: Function | undefined
  logs: Array<string> = []
  ptyKey: string = ''
  end = false

  constructor() {
    this.cammand = []
    this.history = []
    this.historyIndex = 0
    this.index = 0
  }

  getSize(): { cols: number; rows: number } {
    const domRect = this.dom!.getBoundingClientRect()
    const cols = Math.floor(domRect.width / 9.1)
    const rows = Math.floor(domRect.height / 18)
    IPC.send('NodePty:resize', this.ptyKey, { cols, rows }).then((key: string) => IPC.off(key))
    return { cols, rows }
  }

  mount(dom: HTMLElement) {
    this.dom = dom
    return new Promise((resolve) => {
      const doMount = () => {
        const { cols, rows } = this.getSize()
        const appStore = AppStore()
        const theme: { [k: string]: string } = {}
        let appTheme = ''
        if (!appStore?.config?.setup?.theme || appStore?.config?.setup?.theme === 'system') {
          appTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
        } else {
          appTheme = appStore?.config?.setup?.theme
        }
        if (appTheme === 'light') {
          theme.background = '#ffffff'
          theme.foreground = '#334455'
          theme.selectionBackground = '#a0cfff'
        } else {
          theme.background = '#282b3d'
          theme.foreground = '#cfd3dc'
          theme.selectionBackground = '#606266'
        }
        this.xterm = new Terminal({
          cols: cols,
          rows: rows,
          cursorBlink: true,
          allowProposedApi: true,
          cursorWidth: 5,
          cursorStyle: 'bar',
          logLevel: 'off',
          theme: theme
        })
        const fitaddon = new FitAddon()
        this.xterm.loadAddon(fitaddon)
        this.xterm.open(dom)
        fitaddon.fit()
        this.fitaddon = fitaddon
        this.initEvent()
        this.xterm.focus()
        this.logs.forEach((s) => {
          this.xterm?.write(s)
        })
        this.storeCurrentCursor()
        this.initLog()
        resolve(true)
      }

      if (!this.ptyKey) {
        IPC.send('NodePty:init').then((key: string, res: any) => {
          IPC.off(key)
          this.ptyKey = res?.data ?? ''
          /**
           * 接收node-pty数据
           */
          IPC.on(`NodePty:data:${this.ptyKey}`).then((key: string, data: string) => {
            this.write(data)
          })

          doMount()
        })
      } else {
        doMount()
      }
    })
  }

  cleanInput() {
    // 光标移动到当前输入行最后
    const n = this.cammand.length - this.index
    const arr = []
    for (let i = 0; i < n; i += 1) {
      arr.push('\x1B[C')
    }
    if (arr.length > 0) {
      this.xterm!.write(arr.join(''))
    }
    // 传递退格指令
    this.xterm!.write(
      this.cammand
        .map(() => {
          return '\b \b'
        })
        .join('')
    )
  }

  /**
   * 从上个保存位置恢复光标
   */
  resetCursorFromStore() {
    this.xterm?.write('\x1B8')
  }

  /**
   * 保存当前光标位置
   */
  storeCurrentCursor() {
    this.xterm?.write('\x1B7')
  }

  cursorMove(n: number, code: string) {
    const step = []
    for (let i = 0; i < n; i += 1) {
      step.push(code)
    }
    if (step.length > 0) {
      this.xterm!.write(step.join(''))
    }
  }

  /**
   * 光标前进
   * @param n
   */
  cursorMoveGo(n: number) {
    this.cursorMove(n, '\x1B[C')
  }

  /**
   * 光标后退
   * @param n
   */
  cursorMoveBack(n: number) {
    this.cursorMove(n, '\x1B[D')
  }

  addHistory() {
    const c = this.cammand.join('')
    const last = [...this.history].pop()
    if (last?.cammand !== c) {
      this.history.push({
        cammand: c,
        cammands: [...this.cammand]
      })
    }
    this.historyIndex = this.history.length
  }

  resetFromHistory() {
    const c = this.history[this.historyIndex]
    if (c) {
      this.cleanInput()
      this.cammand = [...c.cammands]
      this.xterm!.write(c.cammand)
      this.index = this.cammand.length
      // 存储新光标位置
      this.storeCurrentCursor()
    }
  }

  initEvent() {
    this.xterm!.onData((data) => {
      IPC.send('NodePty:write', this.ptyKey, data).then((key: string) => {
        IPC.off(key)
      })
    })
    /**
     * 重置界面大小
     */
    this.onWindowResit = this.onWindowResit.bind(this)
    window.addEventListener('resize', this.onWindowResit)
  }

  initLog() {
    if (this.logs.length > 0) {
      for (const log of this.logs) {
        this.xterm?.write(log)
      }
    }
  }

  write(data: string) {
    this.xterm?.write(data)
    this.storeCurrentCursor()
    this.logs.push(data)
    this.cammand.splice(0)
    this.index = 0
  }

  onWindowResit() {
    const { cols, rows } = this.getSize()
    this.xterm!.resize(cols, rows)
    this.fitaddon?.fit()
  }

  onCallBack(fn: Function) {
    this._callBack = fn
  }

  cleanLog() {
    this.logs.splice(0)
  }
  destory() {
    window.removeEventListener('resize', this.onWindowResit)
    if (this.ptyKey) {
      IPC.off(`NodePty:data:${this.ptyKey}`)
    }
    this._callBack = undefined
    this.xterm?.dispose()
    this.xterm = undefined
    this.dom = undefined
    this.cammand = []
    this.history = []
    this.index = 0
    this.historyIndex = 0
  }

  stop() {
    return new Promise((resolve) => {
      IPC.send('NodePty:stop', this.ptyKey).then((key: string) => {
        IPC.off(key)
        resolve(true)
      })
    })
  }

  send(cammand: string[]) {
    console.log('XTerm send:', cammand)
    if (this.end) {
      return
    }
    return new Promise((resolve) => {
      IPC.send('NodePty:exec', this.ptyKey, JSON.parse(JSON.stringify(cammand))).then(
        (key: string) => {
          console.log('static cammand finished: ', cammand)
          IPC.off(key)
          this.end = true
          resolve(true)
        }
      )
    })
  }
}

export default XTerm
