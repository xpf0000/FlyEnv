import { BrowserWindow } from 'electron'
import { enable } from '@electron/remote/main'
import { join, extname, dirname } from 'path'
import { createWriteStream, mkdirpSync } from 'fs-extra'
import request from '@shared/request'
import { md5 } from '@shared/utils'

class SiteSuckerManager {
  window?: BrowserWindow
  handled: Set<string> = new Set()
  htmls: Set<string> = new Set()
  links: { [k: string]: string } = {}
  timer?: NodeJS.Timeout
  baseHost?: string
  baseDir?: string

  show(url: string) {
    this.destory()
    const urlObj = new URL(url)
    this.baseHost = urlObj.host
    this.baseDir = join('/Users/x/Desktop/AAA/', urlObj.host)
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
        const uobj = new URL(details.url)
        uobj.hash = ''
        const url = uobj.toString()
        const ContentType: Array<string> = details?.responseHeaders?.['Content-Type'] ?? []
        if (ContentType?.pop() === 'text/html') {
          if (uobj.host === this.baseHost) {
            this.htmls.add(url)
            this.links[url] = ''
          }
        } else {
          this.links[url] = ''
        }
        console.log('htmls: ', this.htmls)
        console.log('subs: ', this.links)
        this.down()
      }
      callback({})
    })
    this.window.loadURL(url).then()
  }

  down() {
    let url = ''
    for (const u in this.links) {
      if (!this.links[u]) {
        url = u
        break
      }
    }
    if (!url) {
      this.timer = setTimeout(() => {
        this.down()
      }, 1000)
      return
    }
    console.log('down: ', url)
    let saveFile = ''
    if (url.includes(this.baseHost!)) {
      let pathDir = url.split(`${this.baseHost!}/`).pop() ?? ''
      if (this.htmls.has(url)) {
        const ext = extname(pathDir)
        if (!!ext) {
          pathDir = pathDir.replace(ext, '.html')
        } else {
          pathDir += '.html'
        }
      }
      saveFile = join(this.baseDir!, pathDir)
    } else {
      const ext = extname(url.replace('http://', '/').replace('https://', '/'))
      saveFile = join(this.baseDir!, `${md5(url)}${ext}`)
    }
    console.log('saveFile: ', saveFile)
    const dir = dirname(saveFile)
    mkdirpSync(dir)
    const stream = createWriteStream(saveFile)
    stream.on('finish', () => {
      this.links[url] = saveFile
      console.log('links: ', this.links)
      this.down()
    })
    this.window!.webContents.session.cookies.get({ url }).then((cookies) => {
      const cookieArr: Array<string> = []
      cookies.forEach((cookie) => {
        cookieArr.push(`${cookie.name}=${cookie.value};`)
      })
      console.log('cookieArr: ', cookieArr)
      request({
        url,
        method: 'get',
        responseType: 'stream',
        headers: {
          cookie: cookieArr.join(' ')
        }
      }).then((res) => {
        if (url.includes(this.baseHost!)) {
          console.log('res: ', res?.request)
        }
        res.data.pipe(stream)
      })
    })
  }

  destory() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.handled.clear()
    this.htmls.clear()
    this.links = {}
    if (this.window) {
      this.window?.destroy()
    }
    this.window = undefined
  }
}

export default new SiteSuckerManager()
