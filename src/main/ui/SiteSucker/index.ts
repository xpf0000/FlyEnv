import Config, { type RunConfig } from './Config'
import PageTask from './PageTask'
import LinkTask from './LinkTask'
import { join } from 'path'
import { Store } from './Store'
import { urlToDir } from './Fn'
import { Callback, LinkItem, type PageLink } from './LinkItem'
import { cpus } from 'os'
import type { CallbackFn } from '@shared/app'

const CPU_Count = cpus().length

type RunParams = {
  url: string
  config: RunConfig
}
class SiteSucker {
  setCallback(fn: CallbackFn) {
    Callback.fn = fn
  }
  show(item: RunParams) {
    this.destroy()
    let url = item.url
    const urlObj = new URL(url)
    urlObj.hash = ''
    url = urlObj.toString()
    Store.host = urlObj.host
    Store.dir = join(item.config.dir, urlObj.host)
    Config.update(item.config)

    const saveFile = urlToDir(url, true)
    const currentPage: PageLink = {
      url,
      saveFile,
      state: 'wait',
      type: 'text/html'
    }
    Store.Pages.push(new LinkItem(currentPage))
    PageTask.init(item?.config?.windowCount ?? 2)
    LinkTask.init(CPU_Count - 1)
    PageTask.updateConfig()
    PageTask.run().then()
    LinkTask.run().then()
    Store.ExcludeUrl.add(url)
  }

  updateConfig(config: RunConfig) {
    Config.update(config)
    PageTask.updateConfig()
  }

  destroy() {
    PageTask.destroy()
    LinkTask.destroy()
    Store.reinit()
  }
}

export default new SiteSucker()
