import { BrowserWindow } from 'electron'
import { enable } from '@electron/remote/main'
import { basename, dirname, extname, join } from 'path'
import { createWriteStream, mkdirpSync, readFile, writeFile, existsSync } from 'fs-extra'
import request from '@shared/request'
import { md5 } from '@shared/utils'

const ExcludeHost = [
  'www.google-analytics.com',
  'hm.baidu.com',
  'www.googletagmanager.com',
  'static.hotjar.com',
  'apis.google.com',
  'www.google.com'
]

type PageLink = {
  url: string
  raw: string
  replaceUrl: string
  fromPage: string
  saveFile: string
  loaded: boolean
}

class SiteSuckerManager {
  window?: BrowserWindow
  pages: Array<PageLink> = []
  pageLoaded: Set<string> = new Set()
  pageLinks: Array<PageLink> = []
  currentPage?: PageLink

  req: Set<string> = new Set()

  handled: Set<string> = new Set()
  htmls: Set<string> = new Set()
  links: { [k: string]: string } = {}
  timer?: NodeJS.Timeout
  baseHost?: string
  baseDir?: string
  running = false
  urls: Array<string> = []
  loadUrls: Set<string> = new Set()
  replacePageUrl: { [k: string]: string } = {}
  replaceLinkUrl: { [k: string]: string } = {}

  constructor() {
    this.down = this.down.bind(this)
  }

  async show(url: string) {
    this.destory()
    const urlObj = new URL(url)
    urlObj.hash = ''
    url = urlObj.toString()
    this.baseHost = urlObj.host
    this.baseDir = join('/Users/x/Desktop/AAA/', urlObj.host)

    const saveFile = this.urlToDir(url, true)
    const currentPage = {
      url,
      raw: '',
      replaceUrl: '',
      fromPage: '',
      saveFile,
      loaded: false
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
        console.log('onBeforeRequest ExcludeHost: ', details.url)
        callback({
          cancel: true
        })
        return
      }
      this.req.add(details.url)
      callback({})
    })
    this.window.webContents.session.webRequest.onCompleted((details) => {
      this.req.delete(details.url)
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
              const item = {
                url,
                raw: '',
                replaceUrl: '',
                fromPage: '',
                saveFile,
                loaded: false
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
    this.fetchPage().then()
  }

  async replaceContent(link: PageLink) {
    if (link.fromPage && existsSync(link.fromPage) && link.raw !== link.replaceUrl) {
      let content = await readFile(link.fromPage, 'utf8')
      content = content.replace(new RegExp(`href="${link.raw}"`, 'g'), `href="${link.replaceUrl}"`)
      await writeFile(link.fromPage, content)
    }
  }

  async fetchPage() {
    if (this.running) {
      return
    }
    const page = this.pages.find((p) => !p.loaded)
    if (!page) {
      this.running = false
      console.log('页面获取完毕 !!!')
      console.log('this.pages: ', this.pages)
      console.log('this.pageLinks: ', this.pageLinks)
      return
    }
    this.running = true
    const pageLoaded = this.pages.find((p) => p.loaded && p.url === page.url)
    if (pageLoaded) {
      page.loaded = true
      await this.replaceContent(page)
      await this.fetchPage()
      return
    }
    this.currentPage = page
    const wait = () => {
      this.timer = setTimeout(async () => {
        this.timer = undefined
        await this.onPageLoaded()
        await this.fetchPage()
      }, 2000)
    }
    console.time('loadURL')
    this.window!.loadURL(page.url)
      .then(() => {
        console.log('loadURL success: ', page.url)
        console.timeEnd('loadURL')
        wait()
      })
      .catch((err) => {
        console.log('loadURL fail: ', err)
        console.timeEnd('loadURL')
        wait()
      })
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
      const linkUrls = alinks.map((a) => {
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
          loaded: false
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
      const linkUrls = links
        .filter((a) => {
          const u = new URL(a, this.currentPage?.url)
          const isExclude = ExcludeHost.includes(u.host)
          return (
            !isExclude &&
            (a.startsWith('https://') || a.startsWith('http://') || a.startsWith('//'))
          )
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
            loaded: false
          }
        })
      this.pageLinks.push(...linkUrls)
    }
    return new Promise((resolve) => {
      console.log('onPageLoaded Start !!!', Array.from(this.req))
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
          this.currentPage!.loaded = true
          console.log('onPageLoaded END !!!')
          console.timeEnd('onPageLoaded')
          resolve(true)
        })
    })
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
    this.pages.splice(0)
    this.pageLinks.splice(0)
    this.pageLoaded.clear()
    if (this.window) {
      this.window?.destroy()
    }
    this.window = undefined
  }
}

export default new SiteSuckerManager()
