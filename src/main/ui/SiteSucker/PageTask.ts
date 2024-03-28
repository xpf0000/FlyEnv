import { CallBack, LinkItem, type PageLink } from './LinkItem'
import { BrowserWindow } from 'electron'
import request from '@shared/request'
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent'
import Config from './Config'
import { enable } from '@electron/remote/main'
import { checkIsExcludeUrl, urlToDir } from './Fn'
import { Store } from './Store'
import { wait } from '../../utils'
import { dirname } from 'path'
import { mkdirp, writeFile } from 'fs-extra'

class PageTaskItem {
  private window?: BrowserWindow
  isDestory?: boolean
  onDestoryed?: (item: any) => void

  constructor() {
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
    this.window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
      if (checkIsExcludeUrl(details.url, false)) {
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
        let isMedia = false
        const headers = details?.responseHeaders ?? {}
        for (const k in headers) {
          if (k.toLowerCase() === 'content-type') {
            const v = headers[k]
            const type = v?.pop() ?? ''
            contentType = type
            if (type.includes('text/html')) {
              isPage = true
            }
            if (
              type.startsWith('image/') ||
              type.startsWith('audio/') ||
              type.startsWith('video/')
            ) {
              isMedia = true
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
          if (checkIsExcludeUrl(details.url, true)) {
            callback({
              cancel: true
            })
            return
          }
          let ok = false
          if (Config.pageLimit) {
            if (url.includes(Config.pageLimit)) {
              ok = true
            }
          } else {
            if (uobj.host === Store.host) {
              ok = true
            }
          }
          if (ok) {
            /**
             * 新页面
             */
            const saveFile = urlToDir(url, true)
            if (!Store.ExcludeUrl.has(url)) {
              Store.ExcludeUrl.add(url)
              const item: PageLink = {
                url,
                saveFile,
                state: 'wait',
                type: contentType,
                size
              }
              Store.Pages.push(new LinkItem(item))
            }
          }
        } else {
          if (checkIsExcludeUrl(details.url, false)) {
            callback({
              cancel: true
            })
            return
          }
          /**
           * 只下载本域名的文件
           */
          if (uobj.host === Store.host) {
            const saveFile = urlToDir(url)
            if (!Store.ExcludeUrl.has(url)) {
              Store.ExcludeUrl.add(url)
              const item: PageLink = {
                url,
                saveFile,
                state: 'wait',
                type: contentType,
                size
              }
              Store.Links.push(new LinkItem(item))
            }
          }
        }
        if (isMedia) {
          callback({
            cancel: true
          })
          return
        }
      }
      callback({})
    })
    this.window.on('close', async () => {
      this.destory()
      this?.onDestoryed?.(this)
    })
  }

  async updateConfig() {
    if (Config.proxy.trim()) {
      const proxy = Config.proxy.trim()
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
  }

  #pageRetry(page: LinkItem) {
    const index = Store.Pages.findIndex((f) => f === page)
    if (index >= 0) {
      Store.Pages.splice(index, 1)
    }
    page.state = 'wait'
    Store.Pages.push(page)
  }

  async run() {
    if (this.isDestory) {
      return
    }
    /**
     * 查找正在等待运行的页面
     */
    const page = Store.Pages.shift()
    /**
     * 未找到
     * 等待间隔时间
     * 继续尝试获取页面
     */
    if (!page) {
      await wait()
      await this.run()
      return
    }

    if (page.retry && page.retry >= Config.maxRetryTimes) {
      console.log('run retryCount out: ', page.retry, page)
      page.state = 'fail'
      await this.run()
      return
    }

    page.state = 'running'

    if (!page.retry) {
      page.retry = 1
    } else {
      page.retry += 1
    }

    /**
     * 设置10秒超时
     */
    const timer = setTimeout(() => {
      this.#pageRetry(page)
      this.run()
      return
    }, Config.timeout)
    Store.LoadedUrl.push(page.url)
    try {
      await this.window!.loadURL(page.url)
    } catch (e) {}
    clearTimeout(timer)
    await wait(1000)
    await this.onPageLoaded(page)
    await this.run()
  }

  parseHtmlPage(html: string, page: LinkItem) {
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
        const urlObj = new URL(u, page.url)
        if (urlObj.host !== Store.host || !urlObj.protocol.includes('http')) {
          right = false
        }
        if (Config.pageLimit) {
          const ustr = urlObj.toString()
          if (!ustr.includes(Config.pageLimit)) {
            right = false
          }
        }
      } catch (e) {
        right = false
      }
      return right
    })
    const replace: { [k: string]: string } = {}
    /**
     * 此处不能根据url过滤
     * 多层页面可能有共同的url, 但是a链接里的不一样, 需要每个页面单独替换
     */
    const linkUrls: Array<LinkItem> = alinks
      .map((a) => {
        const u = new URL(a, page.url)
        u.hash = ''
        const linkUrl = u.toString()
        const saveFile = urlToDir(linkUrl, true)
        const replaceUrl = saveFile.replace(Store.dir, '')
        replace[`href="${a}"`] = `href="${replaceUrl}"`
        return new LinkItem({
          url: linkUrl,
          saveFile,
          state: 'wait',
          type: 'text/html'
        })
      })
      .filter((f) => !Store.ExcludeUrl.has(f.url))
    linkUrls.forEach((l) => {
      Store.ExcludeUrl.add(l.url)
    })
    Store.Pages.push(...linkUrls)
    return replace
  }

  parseHtmlLink(html: string, page: LinkItem) {
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
    const replace: { [k: string]: string } = {}
    /**
     * 过滤链接
     * 1. 排除host包含链接的host的
     * 非http和https协议的
     * 页面里有的
     * 后缀名是html htm php的
     */
    const linkUrls: Array<LinkItem> = links
      .filter((a) => {
        const u = new URL(a, page.url)
        u.hash = ''
        const uu = u.toString()
        return (
          !Config.ExcludeHost.includes(u.host) &&
          u.protocol.includes('http') &&
          !Store.ExcludeUrl.has(uu) &&
          !a.includes('.html') &&
          !a.includes('.htm') &&
          !a.includes('.php')
        )
      })
      .map((a) => {
        const u = new URL(a, page.url)
        u.hash = ''
        const linkUrl = u.toString()
        const saveFile = urlToDir(linkUrl)
        const replaceUrl = saveFile.replace(Store.dir, '')
        replace[`href="${a}"`] = `href="${replaceUrl}"`
        replace[`poster="${a}"`] = `poster="${replaceUrl}"`
        replace[`src="${a}"`] = `src="${replaceUrl}"`
        return new LinkItem({
          url: linkUrl,
          saveFile,
          state: 'wait'
        })
      })
      .filter((f) => !Store.ExcludeUrl.has(f.url))
    linkUrls.forEach((l) => {
      Store.ExcludeUrl.add(l.url)
    })
    Store.Links.push(...linkUrls)
    return replace
  }

  handlePageHtml(html: string, page: LinkItem) {
    let replace = this.parseHtmlPage(html, page)
    for (const r in replace) {
      const v = replace[r]
      html = html.replace(new RegExp(r, 'g'), v)
    }
    replace = this.parseHtmlLink(html, page)
    for (const r in replace) {
      const v = replace[r]
      html = html.replace(new RegExp(r, 'g'), v)
    }
    return html
  }

  onPageLoaded(page: LinkItem) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        console.log('onPageLoaded timer fail', page)
        this.#pageRetry(page)
        resolve(true)
      }, Config.timeout)
      try {
        const all = [
          this.window?.webContents?.executeJavaScript('window.location.href', true),
          this.window?.webContents?.executeJavaScript('document.documentElement.outerHTML', true)
        ]
        Promise.all(all)
          .then(async ([url, html]) => {
            clearTimeout(timer)
            if (checkIsExcludeUrl(url, true)) {
              page.state = 'fail'
              resolve(true)
              return
            }
            const cookies = await this.window!.webContents.session.cookies.get({
              url: page.url
            })
            const cookieArr: Array<string> = []
            cookies.forEach((cookie) => {
              cookieArr.push(`${cookie.name}=${cookie.value};`)
            })
            Store.cookie = cookieArr.join(' ')
            if (page.state === 'running') {
              const saveFile = page.saveFile
              const dir = dirname(saveFile)
              try {
                await mkdirp(dir)
              } catch (e) {}
              html = this.handlePageHtml(html, page)
              await writeFile(saveFile, html)
              page.state = 'success'
            }
            resolve(true)
          })
          .catch((e) => {
            console.log('onPageLoaded catch fail 0000', page, e)
            clearTimeout(timer)
            this.#pageRetry(page)
            resolve(true)
          })
      } catch (e: any) {
        console.log('onPageLoaded catch fail 1111', page, e)
        clearTimeout(timer)
        this.#pageRetry(page)
        resolve(true)
      }
    })
  }

  destory() {
    this.isDestory = true
    if (this.window) {
      this.window?.destroy()
    }
    this.window = undefined
  }
}

class PageTask {
  private task: PageTaskItem[] = []
  init(num: number) {
    const destory = (item: any) => {
      const index = this.task.findIndex((f) => f === item)
      if (index >= 0) {
        this.task.splice(index, 1)
      }
      if (this.task.length === 0) {
        CallBack.fn('window-close')
      }
    }
    for (let i = 0; i < num; i += 1) {
      const item = new PageTaskItem()
      item.onDestoryed = destory
      this.task.push(item)
    }
  }
  async run() {
    Store.ExcludeUrl.clear()
    Store.LoadedUrl.splice(0)
    for (const item of this.task) {
      item.run().then()
      await wait(350)
    }
  }

  updateConfig() {
    this.task.forEach((t) => t.updateConfig())
  }
  destory() {
    this.task.forEach((t) => {
      t.isDestory = true
    })
    this.task.splice(0)
  }
}

export default new PageTask()
