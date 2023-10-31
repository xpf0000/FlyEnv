import { BrowserWindow } from 'electron'
import { enable } from '@electron/remote/main'
import { basename, dirname, extname, join } from 'path'
import { createWriteStream, existsSync, mkdirpSync, readFile, writeFile, stat } from 'fs-extra'
import request from '@shared/request'
import { md5 } from '@shared/utils'
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent'

const os = require('os')

const CPU_Count = os.cpus().length

const BaseExcludeHost = [
  'www.google-analytics.com',
  'hm.baidu.com',
  'www.googletagmanager.com',
  'static.hotjar.com',
  'apis.google.com',
  'www.google.com'
]

const ExcludeHost: Array<string> = []

type LinkState = 'wait' | 'running' | 'success' | 'fail' | 'replace'

type PageLink = {
  url: string
  raw: string
  replaceUrl: string
  fromPage: string
  saveFile: string
  state: LinkState
}

type RunParams = {
  url: string
  config: {
    dir: string
    proxy: string
    excludeLink: string
    pageLimit: string
  }
}

const CallBack: {
  fn: Function
} = {
  fn: () => {}
}

const NoticeDict: { [k: string]: number } = {}

const NoticeOrder = {
  wait: 0,
  running: 1,
  fail: 2,
  replace: 3,
  success: 4
}

class LinkItem implements PageLink {
  fromPage: string
  raw: string
  replaceUrl: string
  saveFile: string
  _state: LinkState
  url: string

  constructor(item: PageLink) {
    this.fromPage = ''
    this.raw = ''
    this.replaceUrl = ''
    this.saveFile = ''
    this._state = 'wait'
    this.url = ''
    Object.assign(this, item)
    this.notice()
  }

  notice() {
    const order = NoticeOrder[this._state]
    const noticeOrder = NoticeDict?.[this.url] ?? -1
    if (noticeOrder < order) {
      NoticeDict[this.url] = order
      CallBack.fn({
        url: this.url,
        state: this._state
      })
    }
  }

  get state() {
    return this._state
  }
  set state(v) {
    this._state = v
    this.notice()
  }
}

class SiteSuckerManager {
  window?: BrowserWindow
  pages: Array<LinkItem> = []
  pageLinks: Array<LinkItem> = []
  currentPage?: LinkItem

  timer?: NodeJS.Timeout
  baseHost?: string
  baseDir?: string
  running = false

  isDestory = false

  task: Set<string> = new Set()

  pageLimitTxt = ''
  urlExclude: Set<string> = new Set()

  constructor() {}

  setCallBack(fn: Function) {
    CallBack.fn = fn
  }

  async show(item: RunParams) {
    this.destory()
    this.isDestory = false
    let url = item.url
    const urlObj = new URL(url)
    urlObj.hash = ''
    url = urlObj.toString()
    this.baseHost = urlObj.host
    this.baseDir = join(item.config.dir, urlObj.host)

    const saveFile = this.urlToDir(url, true)
    const currentPage: PageLink = {
      url,
      raw: '',
      replaceUrl: '',
      fromPage: '',
      saveFile,
      state: 'wait'
    }
    this.pages.push(new LinkItem(currentPage))

    this.window = new BrowserWindow({
      show: true,
      width: 1440,
      height: 960,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: false,
        webSecurity: false
      }
    })
    enable(this.window.webContents)

    if (item.config.proxy.trim()) {
      const proxy = item.config.proxy.trim()
      await this.window.webContents.session.setProxy({
        proxyRules: proxy
      })
      request.defaults.httpAgent = new HttpProxyAgent({
        proxy: proxy
      })
      request.defaults.httpsAgent = new HttpsProxyAgent({
        proxy: proxy,
        rejectUnauthorized: false
      })
    }

    ExcludeHost.splice(0)
    ExcludeHost.push(...BaseExcludeHost)

    if (item.config.excludeLink.trim()) {
      const excludes = item.config.excludeLink
        .trim()
        .split('\n')
        .filter((f) => !!f.trim())
        .map((m) => m.trim())
      ExcludeHost.push(...excludes)
    }

    if (item.config.pageLimit.trim()) {
      this.pageLimitTxt = item.config.pageLimit.trim()
    }

    /**
     * 过滤请求
     * 1. 系统设置的无效请求, 一般都是统计代码
     * 2. 用户定义, 请求链接包含则排除
     */
    const urlExclude = Array.from(this.urlExclude)
    const checkIsExcludeUrl = (url: string): boolean => {
      const u = new URL(url)
      if (ExcludeHost.includes(u.host)) {
        return true
      }
      if (urlExclude.length > 0) {
        const uu = u.toString()
        const find = urlExclude.find((s) => uu.includes(s))
        if (find) {
          return true
        }
      }
      return false
    }
    this.window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
      if (checkIsExcludeUrl(details.url)) {
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
        if (checkIsExcludeUrl(details.url)) {
          callback({
            cancel: true
          })
          return
        }
        const uobj = new URL(details.url)
        uobj.hash = ''
        const url = uobj.toString()
        let isPage = false
        const headers = details?.responseHeaders ?? {}
        for (const k in headers) {
          if (k.toLowerCase() === 'content-type') {
            const v = headers[k]
            if (v?.pop() === 'text/html') {
              isPage = true
            }
          }
        }
        /**
         * 普通页面
         */
        if (isPage) {
          let ok = false
          if (this.pageLimitTxt) {
            if (url.includes(this.pageLimitTxt)) {
              ok = true
            }
          } else {
            if (uobj.host === this.baseHost) {
              ok = true
            }
          }
          if (ok) {
            /**
             * 新页面
             */
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
              this.pages.push(new LinkItem(item))
            }
          }
        } else {
          /**
           * 只下载本域名的文件
           */
          if (uobj.host === this.baseHost) {
            const find = this.pageLinks.find((p) => p.url === url)
            /**
             * 新文件
             */
            if (!find) {
              const saveFile = this.urlToDir(url)
              const item: PageLink = {
                url,
                raw: '',
                replaceUrl: '',
                fromPage: '',
                saveFile,
                state: 'wait'
              }
              this.pageLinks.push(new LinkItem(item))
            }
          }
        }
      }
      callback({})
    })
    this.window.on('close', () => {
      this.destory()
      CallBack.fn('window-close')
    })
    try {
      await this.window.loadURL(url)
    } catch (e) {}
    await this.wait()
    this.running = false
    this.fetchPage().then()
    this.fetchLink().then()
  }

  async wait(time = 2000) {
    return new Promise((resolve) => {
      this.timer = setTimeout(() => {
        this.timer = undefined
        resolve(true)
      }, time)
    })
  }

  /**
   * 异步单线程 打开页面
   */
  async fetchPage() {
    if (this.running || this.isDestory || this.pages.find((p) => p.state === 'running')) {
      return
    }
    const page = this.pages.find((p) => p.state === 'wait')
    if (!page) {
      await this.wait()
      this.running = false
      await this.fetchPage()
      return
    }
    this.running = true
    /**
     * 页面已经加载过了
     * 找到相同url的页面, 更新状态
     */
    const pageLoaded = this.pages.find(
      (p) => (p.state === 'replace' || p.state === 'success') && p.url === page.url
    )
    if (pageLoaded) {
      page.state = 'replace'
      const samePage = this.pages.filter(
        (p) => p.url === page.url && (p.state === 'wait' || p.state === 'fail')
      )
      samePage.forEach((p) => {
        p.state = 'replace'
      })
      this.running = false
      await this.fetchPage()
      return
    }
    this.currentPage = page
    this.currentPage.state = 'running'
    if (existsSync(page.saveFile)) {
      const info = await stat(page.saveFile)
      if (info.size > 0) {
        page.state = 'replace'
        const html = await readFile(page.saveFile, 'utf8')
        this.handlePageHtml(html)
        this.running = false
        await this.fetchPage()
        return
      }
    }
    try {
      await this.window!.loadURL(page.url)
    } catch (e) {}
    await this.wait()
    await this.onPageLoaded()
    this.running = false
    await this.fetchPage()
  }

  async fetchLink() {
    if (this.isDestory) {
      return
    }
    const now = this.task.size
    if (now === 0 && !this.pageLinks.find((p) => p.state === 'wait' || p.state === 'running')) {
      if (!this.pages.find((p) => p.state === 'wait')) {
        await this.doReplace()
      }
      await this.wait()
      await this.fetchLink()
      return
    }
    const cookies = await this.window!.webContents.session.cookies.get({
      url: this.currentPage!.url
    })
    for (let i = now; i < CPU_Count; i += 1) {
      const link = this.pageLinks.find((l) => l.state === 'wait' && !this.task.has(l.url))
      if (link) {
        this.task.add(link.url)
        link.state = 'running'
        const linkLoaded = this.pageLinks.find(
          (p) => (p.state === 'replace' || p.state === 'success') && p.url === link.url
        )
        if (linkLoaded) {
          link.state = 'replace'
          const sameUrl = this.pageLinks.filter(
            (p) => p.url === link.url && (p.state === 'wait' || p.state === 'fail')
          )
          sameUrl.forEach((l) => {
            l.state = 'replace'
          })
          this.task.delete(link.url)
          this.fetchLink().then()
        } else {
          const next = () => {
            link.state = 'replace'
            const sameUrl = this.pageLinks.filter(
              (p) => p.url === link.url && (p.state === 'wait' || p.state === 'fail')
            )
            sameUrl.forEach((l) => {
              l.state = 'replace'
            })
            this.task.delete(link.url)
            this.fetchLink().then()
          }
          const saveFile = link.saveFile
          let size = 0
          if (existsSync(saveFile)) {
            const info = await stat(saveFile)
            size = info.size
          }
          if (size > 0) {
            next()
          } else {
            const dir = dirname(saveFile)
            mkdirpSync(dir)
            const stream = createWriteStream(saveFile)
            stream.on('finish', () => {
              stream.close(() => {
                next()
              })
            })
            stream.on('error', () => {
              stream.close(() => {
                link.state = 'fail'
                this.task.delete(link.url)
                this.fetchLink().then()
              })
            })
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
                  this.task.delete(link.url)
                  this.fetchLink().then()
                })
              })
          }
        }
      } else {
        break
      }
    }
  }

  onPageLoaded() {
    return new Promise((resolve) => {
      this.window?.webContents
        ?.executeJavaScript('document.documentElement.outerHTML', true)
        .then(async (html) => {
          const saveFile = this.currentPage!.saveFile
          const dir = dirname(saveFile)
          mkdirpSync(dir)
          await writeFile(saveFile, html)
          this.handlePageHtml(html)
          resolve(true)
        })
        .catch(() => {
          this.currentPage!.state = 'fail'
          resolve(true)
        })
    })
  }
  handlePageHtml(html: string) {
    this.parseHtmlPage(html)
    this.parseHtmlLink(html)
    this.currentPage!.state = 'replace'
    const samePage = this.pages.filter(
      (p) => p.url === this.currentPage!.url && (p.state === 'wait' || p.state === 'fail')
    )
    samePage.forEach((p) => {
      p.state = 'replace'
    })
  }
  parseHtmlLink(html: string) {
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
    const linkUrls: Array<LinkItem> = links
      .filter((a) => {
        const u = new URL(a, this.currentPage?.url)
        u.hash = ''
        const uu = u.toString()
        return (
          !ExcludeHost.includes(u.host) &&
          u.protocol.includes('http') &&
          !this.pages.find((p) => p.url === uu) &&
          !a.includes('.html')
        )
      })
      .map((a) => {
        const u = new URL(a, this.currentPage?.url)
        u.hash = ''
        const linkUrl = u.toString()
        const saveFile = this.urlToDir(linkUrl)
        const replaceUrl = saveFile.replace(this.baseDir!, '')
        return new LinkItem({
          url: linkUrl,
          raw: a,
          replaceUrl,
          fromPage: this.currentPage?.url ?? '',
          saveFile,
          state: 'wait'
        })
      })
    this.pageLinks.push(...linkUrls)
  }
  parseHtmlPage(html: string) {
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
        if (this.pageLimitTxt) {
          const ustr = urlObj.toString()
          if (!ustr.includes(this.pageLimitTxt)) {
            right = false
          }
        }
      } catch (e) {
        right = false
      }
      return right
    })
    const linkUrls: Array<LinkItem> = alinks.map((a) => {
      const u = new URL(a, this.currentPage?.url)
      u.hash = ''
      const linkUrl = u.toString()
      const saveFile = this.urlToDir(linkUrl, true)
      const replaceUrl = saveFile.replace(this.baseDir!, '')
      return new LinkItem({
        url: linkUrl,
        raw: a,
        replaceUrl,
        fromPage: this.currentPage?.saveFile ?? '',
        saveFile,
        state: 'wait'
      })
    })
    this.pages.push(...linkUrls)
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
      const uobj = new URL(url)
      uobj.hash = ''
      uobj.search = ''
      url = uobj.toString()
      const ext = extname(url.split('/').pop()!)
      saveFile = join(this.baseDir!, `outsite/${md5(url)}${ext}`)
    }
    return saveFile
  }
  async doReplace() {
    for (const page of this.pages) {
      if (page.state === 'replace') {
        page.state = 'success'
        await this.replaceContent(page)
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
              if (link.raw && link.raw !== link.replaceUrl) {
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
    this.isDestory = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.task.clear()
    this.pages.splice(0)
    this.pageLinks.splice(0)
    for (const u in NoticeDict) {
      delete NoticeDict[u]
    }
    if (this.window) {
      this.window?.destroy()
    }
    this.window = undefined
  }
}

export default new SiteSuckerManager()
