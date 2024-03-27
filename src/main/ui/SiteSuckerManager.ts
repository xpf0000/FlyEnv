import { BrowserWindow } from 'electron'
import { enable } from '@electron/remote/main'
import { basename, dirname, extname, join } from 'path'
import {
  createWriteStream,
  existsSync,
  readFile,
  writeFile,
  stat,
  mkdirp,
  removeSync
} from 'fs-extra'
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
  pageUrl?: string
  isPage?: boolean
  type?: string
  size?: number
}

type RunConfig = {
  dir: string
  proxy: string
  excludeLink: string
  pageLimit: string
  timeout: number
  maxImgSize: number
  maxVideoSize: number
}

type RunParams = {
  url: string
  config: RunConfig
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
  pageUrl?: string
  isPage?: boolean
  type?: string
  size?: number

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
        state: this._state,
        type: this.type,
        size: this.size
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

  timeout = 6000

  maxImgSize = 0
  maxVideoSize = 0

  pageLoaded: Set<string> = new Set()

  constructor() {}

  setCallBack(fn: Function) {
    CallBack.fn = fn
  }

  checkIsExcludeUrl = (url: string, isPage: boolean): boolean => {
    const u = new URL(url)
    if (ExcludeHost.includes(u.host)) {
      return true
    }
    if (isPage && this.pageLimitTxt && !url.includes(this.pageLimitTxt)) {
      return true
    }
    return false
  }

  async updateConfig(config: RunConfig) {
    if (config?.proxy?.trim()) {
      const proxy = config.proxy.trim()
      await this?.window?.webContents?.session?.setProxy({
        proxyRules: proxy
      })
      request.defaults.httpAgent = new HttpProxyAgent({
        proxy: proxy
      })
      request.defaults.httpsAgent = new HttpsProxyAgent({
        proxy: proxy,
        rejectUnauthorized: false
      })
    } else {
      await this?.window?.webContents?.session?.setProxy({})
      request.defaults.httpAgent = undefined
      request.defaults.httpsAgent = undefined
    }

    ExcludeHost.splice(0)
    ExcludeHost.push(...BaseExcludeHost)

    if (config?.excludeLink?.trim()) {
      const excludes = config.excludeLink
        .trim()
        .split('\n')
        .filter((f) => !!f.trim())
        .map((m) => m.trim())
      ExcludeHost.push(...excludes)
    }

    if (config?.pageLimit?.trim()) {
      this.pageLimitTxt = config.pageLimit.trim()
    } else {
      this.pageLimitTxt = ''
    }

    if (config?.timeout) {
      this.timeout = config.timeout
    } else {
      this.timeout = 5000
    }

    if (config?.maxImgSize) {
      this.maxImgSize = config.maxImgSize
    } else {
      this.maxImgSize = 0
    }

    if (config?.maxVideoSize) {
      this.maxVideoSize = config.maxVideoSize
    } else {
      this.maxVideoSize = 0
    }
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
      state: 'wait',
      isPage: true,
      type: 'text/html'
    }
    this.currentPage = new LinkItem(currentPage)
    this.pages.push(this.currentPage)

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

    await this.updateConfig(item.config)

    this.window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
      if (this.checkIsExcludeUrl(details.url, false)) {
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
        uobj.hash = ''
        const url = uobj.toString()
        let isPage = false
        let contentType = ''
        let size = 0
        const headers = details?.responseHeaders ?? {}
        for (const k in headers) {
          if (k.toLowerCase() === 'content-type') {
            const v = headers[k]
            const type = v?.pop() ?? ''
            contentType = type
            if (type.includes('text/html')) {
              isPage = true
            }
          } else if (k.toLowerCase() === 'content-length') {
            const length = headers[k]?.pop() ?? '0'
            size = parseInt(length)
          }
        }
        /**
         * 普通页面
         */
        if (isPage) {
          if (this.checkIsExcludeUrl(details.url, true)) {
            callback({
              cancel: true
            })
            return
          }
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
                state: 'wait',
                isPage: true,
                type: contentType,
                size
              }
              this.pages.push(new LinkItem(item))
            }
          }
        } else {
          if (this.checkIsExcludeUrl(details.url, false)) {
            callback({
              cancel: true
            })
            return
          }
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
                state: 'wait',
                type: contentType,
                size
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
    const timer = setTimeout(() => {
      this.currentPage!.state = 'fail'
      this.running = false
      return
    }, this.timeout)
    try {
      await this.window.loadURL(url)
    } catch (e) {}
    clearTimeout(timer)
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
    /**
     * 查找正在等待运行的页面
     */
    const page = this.pages.find((p) => p.state === 'wait')
    /**
     * 未找到
     * 等待间隔时间
     * 继续尝试获取页面
     */
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

    if (this.pageLoaded.has(page.url)) {
      console.log('pageLoaded has ', page.url, page)
    }
    this.pageLoaded.add(page.url)

    /**
     * 设置10秒超时
     */
    const timer = setTimeout(() => {
      page.state = 'fail'
      this.running = false
      this.fetchPage()
      return
    }, this.timeout)

    try {
      await this.window!.loadURL(page.url)
    } catch (e) {}
    clearTimeout(timer)
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
        if (this.checkIsExcludeUrl(link.url, false)) {
          link.state = 'fail'
          const sameUrl = this.pageLinks.filter(
            (p) => p.url === link.url && (p.state === 'wait' || p.state === 'running')
          )
          sameUrl.forEach((l) => {
            l.state = 'fail'
          })
          this.task.delete(link.url)
          this.fetchLink().then()
          continue
        }
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
          continue
        }

        this.task.add(link.url)
        link.state = 'running'
        let timer: NodeJS.Timeout
        const next = () => {
          timer && clearTimeout(timer)
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
          try {
            await mkdirp(dir)
          } catch (e) {}
          const stream = createWriteStream(saveFile)
          const onError = () => {
            stream.close(() => {
              link.state = 'fail'
              this.task.delete(link.url)
              if (existsSync(saveFile)) {
                removeSync(saveFile)
              }
              this.fetchLink().then()
            })
          }
          stream.on('finish', () => {
            stream.close(() => {
              next()
            })
          })
          stream.on('error', () => {
            onError()
          })
          const cookieArr: Array<string> = []
          cookies.forEach((cookie) => {
            cookieArr.push(`${cookie.name}=${cookie.value};`)
          })
          const controller = new AbortController()
          const taskFail = () => {
            try {
              controller.abort()
            } catch (e) {}
            if (!stream.destroyed) {
              onError()
            }
          }
          timer = setTimeout(taskFail, this.timeout)
          request({
            url: link.url,
            timeout: this.timeout,
            method: 'get',
            responseType: 'stream',
            headers: {
              cookie: cookieArr.join(' ')
            },
            signal: controller.signal
          })
            .then((res) => {
              clearTimeout(timer)
              const type = res.headers['content-type']
              const size = parseInt(res.headers['content-length'] ?? '0')
              link.type = type
              link.size = size
              if (type.startsWith('image/')) {
                if (size > 0 && this.maxImgSize > 0 && size > this.maxImgSize * 1024 * 1024) {
                  taskFail()
                  return
                }
              } else if (type.startsWith('audio/') || type.startsWith('video/')) {
                if (size > 0 && this.maxVideoSize > 0 && size > this.maxVideoSize * 1024 * 1024) {
                  taskFail()
                  return
                }
              }
              if (!stream.destroyed) {
                res.data.pipe(stream)
              }
              /**
               * 某些链接耗时太久, 设置超时跳过
               */
              timer = setTimeout(taskFail, this.timeout)
              this.fetchLink().then()
            })
            .catch((e) => {
              clearTimeout(timer)
              taskFail()
            })
        }
      } else {
        break
      }
    }
  }

  /**
   * 获取页面HTML
   * 解析页面
   */
  onPageLoaded() {
    return new Promise((resolve) => {
      let exit: boolean = false
      const timer = setTimeout(() => {
        console.log('onPageLoaded timer fail', this.currentPage)
        exit = true
        this.currentPage!.state = 'fail'
        resolve(true)
      }, this.timeout)
      try {
        const all = [
          this.window?.webContents?.executeJavaScript('window.location.href', true),
          this.window?.webContents?.executeJavaScript('document.documentElement.outerHTML', true)
        ]
        Promise.all(all)
          .then(async ([url, html]) => {
            clearTimeout(timer)
            if (exit) {
              console.log('onPageLoaded had exit !!!')
              return
            }
            if (this.checkIsExcludeUrl(url, true)) {
              this.currentPage!.state = 'fail'
              resolve(true)
              return
            }
            if (this.currentPage!.state === 'running') {
              const saveFile = this.currentPage!.saveFile
              if (existsSync(saveFile)) {
                console.log('existsSync saveFile: ', saveFile, this.currentPage)
              }
              const dir = dirname(saveFile)
              try {
                await mkdirp(dir)
              } catch (e) {}
              await writeFile(saveFile, html)
              this.handlePageHtml(html)
            }
            resolve(true)
          })
          .catch((e) => {
            console.log('onPageLoaded catch fail 0000', this.currentPage, e)
            clearTimeout(timer)
            this.currentPage!.state = 'fail'
            resolve(true)
          })
      } catch (e: any) {
        console.log('onPageLoaded catch fail 1111', this.currentPage, e)
        clearTimeout(timer)
        this.currentPage!.state = 'fail'
        resolve(true)
      }
    })
  }

  /**
   * 解析页面
   * 获取页面各种链接
   * @param html
   */
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

  /**
   * 解析页面链接
   * @param html
   */
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
    /**
     * 过滤链接
     * 1. 排除host包含链接的host的
     * 非http和https协议的
     * 页面里有的
     * 后缀名是html htm php的
     */
    const linkUrls: Array<LinkItem> = links
      .filter((a) => {
        const u = new URL(a, this.currentPage?.url)
        u.hash = ''
        const uu = u.toString()
        return (
          !ExcludeHost.includes(u.host) &&
          u.protocol.includes('http') &&
          !this.pages.find((p) => p.url === uu) &&
          !a.includes('.html') &&
          !a.includes('.htm') &&
          !a.includes('.php')
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
      .sort((a, b) => {
        let an = 1
        let bn = 1
        if (this.pageLinks.find((f) => f.url === a.url && f.state === 'fail')) {
          an = 0
        }
        if (this.pageLinks.find((f) => f.url === b.url && f.state === 'fail')) {
          bn = 0
        }
        return an - bn
      })
    this.pageLinks.push(...linkUrls)
  }

  /**
   * 获取页面A链接
   * @param html
   */
  parseHtmlPage(html: string) {
    const reg = new RegExp('<a([^<]+)href="([^"]+)"', 'g')
    let result
    const imgs = []
    while ((result = reg.exec(html)) != null) {
      imgs.push(result[2].trim())
    }
    /**
     * 过滤链接
     * 1. host不一致, 外站链接
     * 2. 非http/https协议
     * 3. 如果设置了页面强制包含字符串, 则url必须包含此字符串
     */
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
    /**
     * 此处不能根据url过滤
     * 多层页面可能有共同的url, 但是a链接里的不一样, 需要每个页面单独替换
     */
    const linkUrls: Array<LinkItem> = alinks
      .map((a) => {
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
          state: 'wait',
          isPage: true,
          type: 'text/html'
        })
      })
      .sort((a, b) => {
        let an = 1
        let bn = 1
        if (this.pages.find((f) => f.url === a.url && f.state === 'fail')) {
          an = 0
        }
        if (this.pages.find((f) => f.url === b.url && f.state === 'fail')) {
          bn = 0
        }
        return an - bn
      })

    const failed = linkUrls.filter((l) =>
      this.pages.some((f) => f.url === l.url && f.state === 'fail')
    )

    if (failed.length > 0) {
      console.log('parseHtmlPage failed: ', failed, this.currentPage)
    }

    this.pages.push(...linkUrls)
  }

  /**
   * 链接转本地保存路径
   * @param url
   * @param isPageUrl
   */
  urlToDir(url: string, isPageUrl?: boolean) {
    let saveFile = ''
    if (url.includes(this.baseHost!)) {
      let pathDir = url.split(`${this.baseHost!}`).pop() ?? ''
      if (pathDir.endsWith('/')) {
        pathDir += 'index.html'
      }
      pathDir = pathDir
        .split('/')
        .filter((s) => !!s.trim())
        .join('/')
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
            const arr = pathDir.split('/')
            arr.pop()
            arr.push(newName)
            pathDir = arr.join('/')
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
            needReplaceLinks
              .sort((a, b) => {
                return b.raw.length - a.raw.length
              })
              .forEach((link) => {
                if (link.raw && link.raw !== link.replaceUrl) {
                  content = content.replace(
                    new RegExp(`href="${link.raw}"`, 'g'),
                    `href="${link.replaceUrl}"`
                  )
                  content = content.replace(
                    new RegExp(`poster="${link.raw}"`, 'g'),
                    `poster="${link.replaceUrl}"`
                  )
                  content = content.replace(
                    new RegExp(`src="${link.raw}"`, 'g'),
                    `src="${link.replaceUrl}"`
                  )
                }
                link.state = 'success'
              })
            await writeFile(saveFile, content)
          }
        }
      }
    }
    await writeFile('/Users/x/Desktop/pages.json', JSON.stringify(this.pages))
    await writeFile('/Users/x/Desktop/pageLinks.json', JSON.stringify(this.pageLinks))
  }

  /**
   * 更换页面链接
   * @param page
   */
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
    this.pageLoaded.clear()
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
