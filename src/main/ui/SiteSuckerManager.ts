import { BrowserWindow } from 'electron'
import { enable } from '@electron/remote/main'
import { join, extname, dirname } from 'path'
import { createWriteStream, mkdirpSync, readFile, writeFile } from 'fs-extra'
import request from '@shared/request'
import { md5 } from '@shared/utils'

const ExcludeHost = ['www.google-analytics.com']

class SiteSuckerManager {
  window?: BrowserWindow
  handled: Set<string> = new Set()
  htmls: Set<string> = new Set()
  links: { [k: string]: string } = {}
  timer?: NodeJS.Timeout
  baseHost?: string
  baseDir?: string
  running = false
  urls: Array<string> = []
  loadUrls: Set<string> = new Set()

  constructor() {
    this.down = this.down.bind(this)
  }

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
        if (ExcludeHost.includes(uobj.host)) {
          callback({})
          return
        }
        uobj.hash = ''
        const url = uobj.toString()
        const ContentType: Array<string> = details?.responseHeaders?.['Content-Type'] ?? []
        if (ContentType?.pop() !== 'text/html') {
          if (!this.links.hasOwnProperty(url)) {
            this.links[url] = ''
          }
        }
      }
      callback({})
    })
    this.window
      .loadURL(url)
      .then(() => {
        console.log('loadURL !!!')
        this.down()
      })
      .catch(this.down)
  }

  urlToDir(url: string, isPageUrl?: boolean) {
    let saveFile = ''
    if (url.includes(this.baseHost!)) {
      let pathDir = url.split(`${this.baseHost!}`).pop() ?? ''
      if (pathDir.startsWith('/')) {
        pathDir = pathDir.replace('/', '')
      }
      if (isPageUrl) {
        const ext = extname(pathDir)
        if (!!ext) {
          pathDir = pathDir.replace(ext, '.html')
        } else {
          pathDir += '.html'
        }
      }
      pathDir = pathDir.trim()
      if (pathDir === '.html') {
        pathDir = 'index.html'
      }
      const fname = pathDir.split('/').pop()
      if (fname && fname.includes('.html') && !fname?.endsWith('.html')) {
        pathDir = pathDir.replace(fname, `${md5(fname)}.html`)
      }
      saveFile = join(this.baseDir!, pathDir)
    } else {
      const ext = extname(url.split('/').pop()!)
      saveFile = join(this.baseDir!, `outsite/${md5(url)}${ext}`)
    }
    return saveFile
  }

  onPageLoaded(url: string) {
    this.window?.webContents
      ?.executeJavaScript('document.documentElement.outerHTML', true)
      .then(async function (html) {})
  }

  down() {
    if (this.running) {
      return
    }
    let url = ''
    for (const u in this.links) {
      if (!this.links[u]) {
        url = u
        break
      }
    }
    if (!url) {
      console.log('END !!!', this.urls)
      const pageURL = this.urls.pop()
      if (pageURL && !this.loadUrls.has(pageURL)) {
        this.loadUrls.add(pageURL)
        console.log('load url: ', pageURL)
        this?.window?.loadURL(pageURL)?.then(this.down)?.catch(this.down)
      } else {
        const data = {
          page: Array.from(this.loadUrls),
          links: this.links
        }
        writeFile(
          join('/Users/x/Desktop/AAA/', `${this.baseHost}.json`),
          JSON.stringify(data)
        ).then()
        this.timer = setTimeout(() => {
          this.down()
        }, 1000)
      }
      return
    }
    this.running = true
    console.log('down: ', url)
    let saveFile = ''
    if (url.includes(this.baseHost!)) {
      let pathDir = url.split(`${this.baseHost!}`).pop() ?? ''
      if (pathDir.startsWith('/')) {
        pathDir = pathDir.replace('/', '')
      }
      if (this.htmls.has(url)) {
        const ext = extname(pathDir)
        if (!!ext) {
          pathDir = pathDir.replace(ext, '.html')
        } else {
          pathDir += '.html'
        }
      }
      pathDir = pathDir.trim()
      if (pathDir === '.html') {
        pathDir = 'index.html'
      }
      saveFile = join(this.baseDir!, pathDir)
    } else {
      const ext = extname(url.split('/').pop()!)
      saveFile = join(this.baseDir!, `outsite/${md5(url)}${ext}`)
    }
    console.log('saveFile: ', saveFile)
    const dir = dirname(saveFile)
    mkdirpSync(dir)
    const stream = createWriteStream(saveFile)
    stream.on('finish', async () => {
      this.links[url] = saveFile
      const doReplace = async () => {
        const replaceUrl = saveFile.replace(this.baseDir!, '')
        for (const u in this.links) {
          if (this.links[u] && this.links[u] !== 'ERROR') {
            const f = this.links[u]
            const ext = extname(f)
            if (ext === '.html' || ext === '.css' || ext === '.js') {
              let content = await readFile(f, 'utf8')
              content = content.replace(new RegExp(url, 'g'), replaceUrl)
              await writeFile(f, content)
            }
          }
        }
      }
      const parseHtml = async () => {
        if (saveFile.endsWith('.html')) {
          const html = await readFile(saveFile, 'utf8')
          const reg = new RegExp('<a([^<]+)href="([^"]+)"', 'g')
          let result
          const imgs = []
          while ((result = reg.exec(html)) != null) {
            imgs.push(result[2].trim())
          }
          const alinks = imgs.filter((u) => {
            if (u.startsWith('#')) {
              return false
            }
            let right = true
            try {
              const urlObj = new URL(u, url)
              if (urlObj.host !== this.baseHost || !urlObj.protocol.includes('http')) {
                right = false
              }
            } catch (e) {
              right = false
            }
            return right
          })
          const linkUrls = alinks
            .map((a) => {
              const u = new URL(a, url)
              u.hash = ''
              return u.toString()
            })
            .filter((u) => !this.loadUrls.has(u) && !this.urls.includes(u))
          this.urls.push(...linkUrls)
        }
      }
      stream.close(async () => {
        await doReplace()
        // await parseHtml()
        this.running = false
        this.down()
      })
    })
    stream.on('error', (err) => {
      console.log('stream error: ', err)
      this.links[url] = 'ERROR'
      this.running = false
      this.down()
    })
    this.window!.webContents.session.cookies.get({ url }).then((cookies) => {
      const cookieArr: Array<string> = []
      cookies.forEach((cookie) => {
        cookieArr.push(`${cookie.name}=${cookie.value};`)
      })
      request({
        url,
        method: 'get',
        responseType: 'stream',
        timeout: 5000,
        headers: {
          cookie: cookieArr.join(' ')
        }
      })
        .then((res) => {
          res.data.pipe(stream)
        })
        .catch(() => {
          this.links[url] = 'ERROR'
          this.running = false
          this.down()
        })
    })
  }

  destory() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.urls.splice(0)
    this.loadUrls.clear()
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
