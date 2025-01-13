import '@xterm/xterm/css/xterm.css'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import IPC from './IPC'
import { AppStore } from '@/store/app'

const { nativeTheme } = require('@electron/remote')

interface XTermType {
  xterm: Terminal | undefined
  dom: HTMLElement | undefined
}

class XTerm implements XTermType {
  xterm: Terminal | undefined
  dom: HTMLElement | undefined
  fitaddon: FitAddon | undefined
  logs: Array<string> = []
  ptyKey: string = ''
  end = false
  private resolve: Function | undefined = undefined

  constructor() {}

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
        console.log('doMount: ', dom)
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

  initEvent() {
    this.xterm!.onData((data) => {
      if (this.end) {
        return
      }
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
    console.log('initLog: ', this.logs)
    if (this.logs.length > 0) {
      for (const log of this.logs) {
        this.xterm?.write(log)
      }
    }
  }

  write(data: string) {
    if (!this.xterm) {
      console.log('not xterm !!!!!!')
    }
    this.xterm?.write(data)
    if (
      data.startsWith(`\r`) ||
      data.endsWith(`\u001b[K`) ||
      data.endsWith(`\x1B[K`) ||
      data.endsWith(`\\u001b[K`) ||
      data.endsWith(`\\x1B[K`) ||
      data.endsWith(`\x1B[K\x1B[13C`) ||
      data.endsWith(`\u001b[K\u001b[13C`) ||
      data.endsWith(`\\x1B[K\\x1B[13C`) ||
      data.endsWith(`\\u001b[K\\u001b[13C`)
    ) {
      console.log('logs pop !!!!!!!!!!!!!!@@@@@@@@@@@@@@')
      this.logs.pop()
    }
    if (this.logs.length > 100) {
      this.logs.shift()
    }
    this.logs.push(data)
  }

  onWindowResit() {
    const { cols, rows } = this.getSize()
    this.xterm!.resize(cols, rows)
    this.fitaddon?.fit()
  }

  cleanLog() {
    this.logs.splice(0)
  }

  destory() {
    if (this.ptyKey) {
      IPC.off(`NodePty:data:${this.ptyKey}`)
    }
    this.unmounted()
    this.cleanLog()
  }

  unmounted() {
    window.removeEventListener('resize', this.onWindowResit)
    try {
      this.fitaddon?.dispose()
      this.xterm?.dispose()
    } catch (e) {}
    this.xterm = undefined
    this.fitaddon = undefined
    this.dom = undefined
  }

  stop() {
    return new Promise((resolve) => {
      IPC.send('NodePty:stop', this.ptyKey).then((key: string) => {
        IPC.off(key)
        this.resolve && this.resolve(true)
        this.resolve = undefined
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
      this.resolve = resolve
      const param = [...cammand]
      param.push(`wait;`)
      param.push(`echo "Task-${this.ptyKey}-END" && exit 0;`)
      IPC.send('NodePty:exec', this.ptyKey, param).then((key: string) => {
        console.log('static cammand finished: ', cammand)
        IPC.off(key)
        this.end = true
        this.resolve = undefined
        resolve(true)
      })
    })
  }
}

export default XTerm
