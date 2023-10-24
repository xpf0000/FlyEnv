import { BrowserWindow } from 'electron'
import { enable } from '@electron/remote/main'

class SiteSuckerManager {
  window?: BrowserWindow
  handled: Set<string> = new Set()
  htmls: Set<string> = new Set()
  subs: { [k: string]: Array<string> } = {}
  timer?: NodeJS.Timeout

  show(url: string) {
    this.destory()
    this.window = new BrowserWindow({
      show: true,
      width: 1440,
      height: 1080,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: false,
        webSecurity: false
      }
    })
    enable(this.window.webContents)
    this.window.on('close', () => {
      this.destory()
    })
    this.window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      if (
        details?.method === 'GET' &&
        details?.statusCode >= 200 &&
        details?.statusCode < 300 &&
        (details?.url?.startsWith('http://') || details?.url?.startsWith('https://'))
      ) {
        const u = details.url
        const r = details.referrer
        const uobj = new URL(u)
        const ContentType: Array<string> = details?.responseHeaders?.['Content-Type'] ?? []
        if (ContentType?.pop() === 'text/html') {
          uobj.hash = ''
          this.htmls.add(uobj.toString())
        }
        if (r) {
          if (!this.subs[r]) {
            this.subs[r] = []
          }
          this.subs[r].push(u)
        }
        console.log('htmls: ', this.htmls)
        console.log('subs: ', this.subs)
      }
      callback({})
    })
    this.window.loadURL(url).then()
  }

  down() {
    const htmls: Array<string> = Array.from(this.htmls).filter((h) => !this.handled.has(h))
    const u = htmls.pop()
    if (!u) {
      this.timer = setTimeout(() => {
        this.down()
      }, 1000)
    }
  }

  destory() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.handled.clear()
    this.htmls.clear()
    this.subs = {}
    if (this.window) {
      this.window?.destroy()
    }
    this.window = undefined
  }
}

export default new SiteSuckerManager()
