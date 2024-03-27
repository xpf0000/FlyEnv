import Config from './Config'
import { basename, extname, join } from 'path'
import { md5 } from '@shared/utils'
import { Store } from './Store'

export const checkIsExcludeUrl = (url: string, isPage: boolean): boolean => {
  const u = new URL(url)
  if (Config.ExcludeHost.includes(u.host)) {
    return true
  }
  if (isPage && Config.pageLimit && !url.includes(Config.pageLimit)) {
    return true
  }
  return false
}

export const urlToDir = (url: string, isPageUrl?: boolean) => {
  let saveFile = ''
  if (url.includes(Store.host)) {
    let pathDir = url.split(`${Store.host}`).pop() ?? ''
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
    saveFile = join(Store.dir, pathDir)
  } else {
    const uobj = new URL(url)
    uobj.hash = ''
    uobj.search = ''
    url = uobj.toString()
    const ext = extname(url.split('/').pop()!)
    saveFile = join(Store.dir, `outsite/${md5(url)}${ext}`)
  }
  return saveFile
}
