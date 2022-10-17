import 'xterm/css/xterm.css'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
// @ts-ignore
import IPC from './IPC.js'

const exclude = [
  'Help',
  'Home',
  'PageUp',
  'Delete',
  'End',
  'PageDown',
  'Escape',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
  'Tab'
]

const logs: Array<string> = []

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

  constructor() {
    this.cammand = []
    this.history = []
    this.historyIndex = 0
    this.index = 0
  }

  getSize(): { cols: number; rows: number } {
    const domRect = this.dom!.getBoundingClientRect()
    const cols = Math.floor(domRect.width / 9.1)
    const rows = Math.floor(domRect.height / 17)
    IPC.send('NodePty:resize', { cols, rows })
    return { cols, rows }
  }

  mount(dom: HTMLElement) {
    this.dom = dom
    const { cols, rows } = this.getSize()
    this.xterm = new Terminal({
      cols: cols,
      rows: rows,
      cursorBlink: true,
      allowProposedApi: true,
      cursorWidth: 5,
      cursorStyle: 'bar',
      logLevel: 'off',
      theme: {
        background: '#2a2b2c' //背景色
      }
    })
    const fitaddon = new FitAddon()
    this.xterm.loadAddon(fitaddon)
    this.xterm.open(dom)
    fitaddon.fit()
    this.fitaddon = fitaddon
    this.initEvent()
    this.xterm.focus()
    console.log('logs: ', JSON.parse(JSON.stringify(logs)))
    logs.forEach((s) => {
      this.xterm?.write(s)
    })
    this.storeCurrentCursor()
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
    /**
     * 处理组合键操作
     * 粘贴
     * ctrl+c 中断
     * alt + k 清屏
     */
    this.xterm!.attachCustomKeyEventHandler((e) => {
      if (e.key === 'v' && e.metaKey) {
        navigator.clipboard.readText().then((text) => {
          // 清空当前内容
          this.cleanInput()
          const arr = text.split('')
          // 在光标处插入内容
          this.cammand.splice(this.index, 0, ...arr)
          this.xterm!.write(this.cammand.join(''))
          this.index += arr.length
          // 从上一个光标存储位置恢复
          this.resetCursorFromStore()
          const n = arr.length
          // 光标前进插入内容长度
          this.cursorMoveGo(n)
          // 存储改变后的光标位置
          this.storeCurrentCursor()
        })
      } else if (e.key === 'c' && e.ctrlKey) {
        IPC.send('NodePty:write', '\0o3\r', false)
      } else if (e.key === 'k' && e.metaKey) {
        IPC.send('NodePty:write', 'clear\r', false)
      }
      return true
    })

    /**
     * 处理键盘输入事件
     */
    this.xterm!.onKey((e) => {
      const ev = e.domEvent
      const printable = !ev.altKey && !ev.ctrlKey && !ev.metaKey
      console.log(e)
      if (ev.key === 'Enter') {
        this.xterm!.write('\r\n')
        if (this.cammand.length > 0) {
          this.addHistory()
          const cammand = this.cammand.join('')
          IPC.send('NodePty:write', cammand + '\r').then((key: string) => {
            console.log('cammand finished: ', cammand)
            IPC.off(key)
            this._callBack && this._callBack()
            logs.splice(0)
          })
          this.cammand.splice(0)
          this.index = 0
        }
      } else if (ev.key === 'Backspace') {
        ev.stopPropagation()
        ev.preventDefault()
        if (this.cammand.length > 0 && this.index > 0) {
          this.cleanInput()
          this.cammand.splice(this.index - 1, 1)
          this.xterm!.write(this.cammand.join(''))
          this.index -= 1
          // 从上个存储光标位置恢复
          this.resetCursorFromStore()
          // 光标后退一位
          this.cursorMoveBack(1)
          // 存储新光标位置
          this.storeCurrentCursor()
        }
      } else if (exclude.includes(ev.key)) {
        ev.stopPropagation()
        ev.preventDefault()
        return
      } else if (ev.key === 'ArrowLeft') {
        if (this.index > 0) {
          this.index -= 1
          // 光标后退一位
          this.xterm!.write(e.key)
          // 存储新光标位置
          this.storeCurrentCursor()
        }
      } else if (ev.key === 'ArrowRight') {
        if (this.index < this.cammand.length) {
          this.index += 1
          // 光标前进一位
          this.xterm!.write(e.key)
          // 存储新光标位置
          this.storeCurrentCursor()
        }
      } else if (ev.key === 'ArrowUp') {
        if (this.historyIndex > 0) {
          this.historyIndex -= 1
          this.resetFromHistory()
        }
      } else if (ev.key === 'ArrowDown') {
        if (this.historyIndex < this.history.length - 1) {
          this.historyIndex += 1
          this.resetFromHistory()
        } else {
          this.historyIndex = history.length
          this.cleanInput()
          this.cammand.splice(0)
          this.index = 0
          // 存储新光标位置
          this.storeCurrentCursor()
        }
      } else if (printable) {
        this.cleanInput()
        this.cammand.splice(this.index, 0, e.key)
        this.xterm!.write(this.cammand.join(''))
        this.index += 1
        if (this.index !== this.cammand.length) {
          // 从上个存储光标位置恢复
          this.resetCursorFromStore()
          // 光标前进一位
          this.cursorMoveGo(1)
          // 存储新光标位置
          this.storeCurrentCursor()
        } else {
          // 存储新光标位置
          this.storeCurrentCursor()
        }
      }
    })

    /**
     * 重置界面大小
     */
    this.onWindowResit = this.onWindowResit.bind(this)
    window.addEventListener('resize', this.onWindowResit)

    /**
     * 接收node-pty数据
     */
    IPC.on('NodePty:data').then((key: string, data: string) => {
      this.xterm?.write(data)
      this.storeCurrentCursor()
      logs.push(data)
      this.cammand.splice(0)
      this.index = 0
    })
  }

  onWindowResit() {
    const { cols, rows } = this.getSize()
    this.xterm!.resize(cols, rows)
    this.fitaddon?.fit()
  }

  onCallBack(fn: Function) {
    this._callBack = fn
  }

  destory() {
    window.removeEventListener('resize', this.onWindowResit)
    this._callBack = undefined
    this.xterm?.dispose()
    this.xterm = undefined
    this.dom = undefined
    this.cammand = []
    this.history = []
    this.index = 0
    this.historyIndex = 0
  }

  static send(cammand: string) {
    return new Promise((resolve) => {
      IPC.send('NodePty:write', cammand + '\r').then((key: string) => {
        console.log('static cammand finished: ', cammand)
        IPC.off(key)
        logs.splice(0)
        resolve(true)
      })
    })
  }
}

export default XTerm
