import { BrowserWindow } from 'electron'
import { enable } from '@electron/remote/main'
import { basename, dirname, extname, join } from 'path'
import { createWriteStream, mkdirpSync, readFile, writeFile, existsSync } from 'fs-extra'
import request from '@shared/request'
import { md5 } from '@shared/utils'
const os = require('os')

const CPU_Count = os.cpus().length

const ExcludeHost = [
  'www.google-analytics.com',
  'hm.baidu.com',
  'www.googletagmanager.com',
  'static.hotjar.com',
  'apis.google.com',
  'www.google.com'
]

type LinkState = 'wait' | 'running' | 'success' | 'fail' | 'replace'

type PageLink = {
  url: string
  raw: string
  replaceUrl: string
  fromPage: string
  saveFile: string
  state: LinkState
}

class SiteSuckerManager {
  window?: BrowserWindow
  pages: Array<PageLink> = []
  pageLinks: Array<PageLink> = []
  currentPage?: PageLink

  timer?: NodeJS.Timeout
  baseHost?: string
  baseDir?: string
  running = false

  task: Array<number> = []

  constructor() {}

  async show(url: string) {
    this.destory()
    const urlObj = new URL(url)
    urlObj.hash = ''
    url = urlObj.toString()
    this.baseHost = urlObj.host
    this.baseDir = join('/Users/x/Desktop/AAA/', urlObj.host)

    const saveFile = this.urlToDir(url, true)
    const currentPage: PageLink = {
      url,
      raw: '',
      replaceUrl: '',
      fromPage: '',
      saveFile,
      state: 'wait'
    }
    this.pages.push(currentPage)

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
    await this.window.webContents.session.setProxy({
      proxyRules: '127.0.0.1:1087'
    })
    this.window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
      const u = new URL(details.url)
      if (ExcludeHost.includes(u.host)) {
        callback({
          cancel: true
        })
        return
      }
      callback({})
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
          callback({
            cancel: true
          })
          return
        }
        uobj.hash = ''
        const url = uobj.toString()
        const ContentType: Array<string> = details?.responseHeaders?.['Content-Type'] ?? []
        if (ContentType?.pop() === 'text/html') {
          if (uobj.host === this.baseHost) {
            if (!this.pages.find((p) => p.url === url)) {
              const saveFile = this.urlToDir(url, true)
              const item: PageLink = {
                url,
                raw: '',
                replaceUrl: '',
                fromPage: '',
                saveFile,
                state: 'wait'
              }
              this.pages.push(item)
              this.fetchPage().then()
            }
          }
        }
      }
      callback({})
    })
    this.window.on('close', () => {
      this.destory()
    })
    this.running = false
    this.fetchPage().then()
  }

  onPageLoaded() {
    const parseHtmlPage = (html: string) => {
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
          const urlObj = new URL(u, this.currentPage?.url)
          if (urlObj.host !== this.baseHost || !urlObj.protocol.includes('http')) {
            right = false
          }
        } catch (e) {
          right = false
        }
        return right
      })
      const linkUrls: Array<PageLink> = alinks.map((a) => {
        const u = new URL(a, this.currentPage?.url)
        u.hash = ''
        const linkUrl = u.toString()
        const saveFile = this.urlToDir(linkUrl, true)
        const replaceUrl = saveFile.replace(this.baseDir!, '')
        return {
          url: linkUrl,
          raw: a,
          replaceUrl,
          fromPage: this.currentPage?.saveFile ?? '',
          saveFile,
          state: 'wait'
        }
      })
      this.pages.push(...linkUrls)
    }
    const parseHtmlLink = (html: string) => {
      const links = []
      let result
      let reg = new RegExp('<link([^<]+)href="([^"]+)"', 'g')
      while ((result = reg.exec(html)) != null) {
        links.push(result[2].trim())
      }
      reg = new RegExp('<script([^<]+)src="([^"]+)"', 'g')
      while ((result = reg.exec(html)) != null) {
        links.push(result[2].trim())
      }
      reg = new RegExp('<img([^<]+)src="([^"]+)"', 'g')
      while ((result = reg.exec(html)) != null) {
        links.push(result[2].trim())
      }
      reg = new RegExp('<video([^<]+)src="([^"]+)"', 'g')
      while ((result = reg.exec(html)) != null) {
        links.push(result[2].trim())
      }
      reg = new RegExp('<video([^<]+)poster="([^"]+)"', 'g')
      while ((result = reg.exec(html)) != null) {
        links.push(result[2].trim())
      }
      reg = new RegExp('<source([^<]+)src="([^"]+)"', 'g')
      while ((result = reg.exec(html)) != null) {
        links.push(result[2].trim())
      }
      const linkUrls: Array<PageLink> = links
        .filter((a) => {
          const u = new URL(a, this.currentPage?.url)
          return !ExcludeHost.includes(u.host) && u.protocol.includes('http')
        })
        .map((a) => {
          const u = new URL(a, this.currentPage?.url)
          u.hash = ''
          const linkUrl = u.toString()
          const saveFile = this.urlToDir(linkUrl)
          const replaceUrl = saveFile.replace(this.baseDir!, '')
          return {
            url: linkUrl,
            raw: a,
            replaceUrl,
            fromPage: this.currentPage?.url ?? '',
            saveFile,
            state: 'wait'
          }
        })
      this.pageLinks.push(...linkUrls)
    }
    return new Promise((resolve) => {
      console.time('onPageLoaded')
      this.window?.webContents
        ?.executeJavaScript('document.documentElement.outerHTML', true)
        .then(async (html) => {
          const saveFile = this.currentPage!.saveFile
          const dir = dirname(saveFile)
          mkdirpSync(dir)
          await writeFile(saveFile, html)
          parseHtmlPage(html)
          parseHtmlLink(html)
          console.timeEnd('onPageLoaded')
          resolve(true)
        })
        .catch(() => {
          this.currentPage!.state = 'fail'
          console.timeEnd('onPageLoaded')
          resolve(true)
        })
    })
  }

  async fetchPage() {
    if (this.running) {
      return
    }
    const page = this.pages.find((p) => p.state === 'wait')
    if (!page) {
      this.running = false
      console.log('页面获取完毕 !!!')
      console.log(
        'this.pages: ',
        this.pages.filter((p) => p.state !== 'success')
      )
      console.log(
        'this.pageLinks: ',
        this.pageLinks.filter((p) => p.state !== 'success')
      )
      return
    }
    this.running = true
    const pageLoaded = this.pages.find(
      (p) => (p.state === 'replace' || p.state === 'success') && p.url === page.url
    )
    if (pageLoaded) {
      page.state = 'replace'
      this.running = false
      await this.fetchPage()
      return
    }
    this.currentPage = page
    this.currentPage.state = 'running'
    const wait = () => {
      this.timer = setTimeout(async () => {
        this.timer = undefined
        await this.onPageLoaded()
        this.currentPage!.state = 'replace'
        this.running = false
        await this.fetchLink()
        console.log('this.currentPage: ', this.currentPage)
        await this.fetchPage()
      }, 2000)
    }
    console.time('loadURL')
    this.window!.loadURL(page.url)
      .then(() => {
        console.timeEnd('loadURL')
        wait()
      })
      .catch(() => {
        console.timeEnd('loadURL')
        wait()
      })
  }

  async fetchLink() {
    const now = this.task.length
    for (let i = now; i < CPU_Count; i += 1) {
      const link = this.pageLinks.find((l) => l.state === 'wait')
      if (link) {
        link.state = 'running'
        this.task.push(0)
        const linkLoaded = this.pageLinks.find(
          (p) => (p.state === 'replace' || p.state === 'success') && p.url === link.url
        )
        if (linkLoaded) {
          link.state = 'replace'
          this.task.pop()
          this.fetchLink().then()
        } else {
          const saveFile = link.saveFile
          const dir = dirname(saveFile)
          mkdirpSync(dir)
          const stream = createWriteStream(saveFile)
          stream.on('finish', () => {
            stream.close(() => {
              link.state = 'replace'
              this.task.pop()
              this.fetchLink().then()
            })
          })
          stream.on('error', () => {
            stream.close(() => {
              link.state = 'fail'
              this.task.pop()
              this.fetchLink().then()
            })
          })
          this.window!.webContents.session.cookies.get({ url: this.currentPage!.url }).then(
            (cookies) => {
              const cookieArr: Array<string> = []
              cookies.forEach((cookie) => {
                cookieArr.push(`${cookie.name}=${cookie.value};`)
              })
              request({
                url: link.url,
                method: 'get',
                responseType: 'stream',
                headers: {
                  cookie: cookieArr.join(' ')
                }
              })
                .then((res) => {
                  res.data.pipe(stream)
                })
                .catch(() => {
                  stream.close(() => {
                    link.state = 'fail'
                    this.task.pop()
                    this.fetchLink().then()
                  })
                })
            }
          )
        }
      } else {
        await this.doReplace()
        break
      }
    }
  }

  urlToDir(url: string, isPageUrl?: boolean) {
    let saveFile = ''
    if (url.includes(this.baseHost!)) {
      let pathDir = url.split(`${this.baseHost!}`).pop() ?? ''
      if (pathDir.startsWith('/')) {
        pathDir = pathDir.replace('/', '')
      }
      /**
       * 是否页面
       */
      if (isPageUrl) {
        /**
         * 包含问号
         * 动态页面, 页面地址不变, 根据参数加载内容
         * 根据参数生成每个页面
         */
        const name = basename(pathDir)
        if (url.includes('?')) {
          const newName = `${md5(name)}.html`
          pathDir = pathDir.replace(name, newName)
        } else {
          if (pathDir.endsWith('/')) {
            pathDir = `${pathDir}index.html`
          } else {
            const ext = extname(pathDir)
            let newName = ''
            // 有扩展名的
            if (!!ext) {
              if (ext !== '.html') {
                newName = name.replace(ext, '.html')
              }
            } else {
              newName = name + '.html'
            }
            if (newName) {
              pathDir = pathDir.replace(name, newName)
            }
          }
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
    return saveFile
  }

  async doReplace() {
    for (const page of this.pages) {
      if (page.state === 'replace') {
        await this.replaceContent(page)
        page.state = 'success'
      }
      if (page.state === 'success') {
        const needReplaceLinks = this.pageLinks.filter(
          (p) => p.state === 'replace' && p.fromPage === page.url
        )
        if (needReplaceLinks.length > 0) {
          const saveFile = page.saveFile
          if (existsSync(saveFile)) {
            let content = await readFile(saveFile, 'utf-8')
            needReplaceLinks.forEach((link) => {
              if (link.raw !== link.replaceUrl) {
                content = content.replace(new RegExp(link.raw, 'g'), link.replaceUrl)
              }
              link.state = 'success'
            })
            await writeFile(saveFile, content)
          }
        }
      }
    }
  }

  async replaceContent(page: PageLink) {
    if (page.fromPage && existsSync(page.fromPage) && page.raw !== page.replaceUrl) {
      let content = await readFile(page.fromPage, 'utf8')
      content = content.replace(new RegExp(`href="${page.raw}"`, 'g'), `href="${page.replaceUrl}"`)
      await writeFile(page.fromPage, content)
    }
  }

  destory() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.pages.splice(0)
    this.pageLinks.splice(0)
    if (this.window) {
      this.window?.destroy()
    }
    this.window = undefined
  }
}

export default new SiteSuckerManager()
