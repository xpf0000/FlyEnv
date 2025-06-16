import type BaseTask from '@/components/AI/Task/BaseTask'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import IPC from '@/util/IPC'
import { AIStore } from '@/components/AI/store'
import { startNginx } from '@/components/AI/Fn/Nginx'
import { startApache } from '@/components/AI/Fn/Apache'
import { startPhp } from '@/components/AI/Fn/Php'
import { nextTick } from 'vue'
import type { SoftInstalled } from '@shared/app'
import { I18nT } from '@lang/index'
import { handleWriteHosts } from '@/util/Host'
import { shell } from '@/util/NodeFn'

export function addRandaSite(this: BaseTask) {
  return new Promise(async (resolve, reject) => {
    const appStore = AppStore()
    const brewStore = BrewStore()
    const php = brewStore.module('php').installed.find((p) => p.version) ?? {}
    const write = appStore.config.setup?.hosts?.write ?? true
    const ipv6 = appStore.config.setup?.hosts?.ipv6 ?? true
    IPC.send(`app-fork:host`, 'addRandaSite', JSON.parse(JSON.stringify(php)), write, ipv6).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res.code === 0) {
          appStore.initHost()
          handleWriteHosts().then().catch()
          const item = res.data
          const aiStore = AIStore()
          aiStore.chatList.push({
            user: 'ai',
            content: `${I18nT('ai.siteCreatedSuccessfully')}
${I18nT('ai.siteDomain')}: ${item.host}
${I18nT('ai.siteDirectory')}: <a href="javascript:void();" onclick="openDir('${item.dir}')">${
              item.dir
            }</a>
${I18nT('ai.tryingToStartService')}`
          })
          resolve({
            host: item.host,
            php: item.version
          })
        } else if (res.code === 1) {
          reject(res.msg)
        }
      }
    )
  })
}

export function openSiteBaseService(this: BaseTask, item: { host: string; php: SoftInstalled }) {
  return new Promise(async (resolve) => {
    const appStore = AppStore()
    const brewStore = BrewStore()
    await brewStore.module('apache').fetchInstalled()
    await brewStore.module('nginx').fetchInstalled()
    await brewStore.module('php').fetchInstalled()
    let current = appStore.config.server?.nginx?.current
    let installed = brewStore.module('nginx').installed
    const nginx = installed?.find((i) => i.path === current?.path && i.version === current?.version)

    current = appStore.config.server?.apache?.current
    installed = brewStore.module('apache').installed
    const apache = installed?.find(
      (i) => i.path === current?.path && i.version === current?.version
    )

    const php = brewStore
      .module('php')
      .installed.find((i) => i.path === item?.php?.path && i.version === item?.php?.version)
    try {
      let url = ''
      if (nginx && (!apache || !apache?.run)) {
        await startNginx.call(this)
        url = `http://${item.host}`
      } else if (apache && (!nginx || !nginx?.run)) {
        await startApache.call(this)
        url = `http://${item.host}:8080`
      }
      if (php) {
        await startPhp.call(this, php)
      }
      const arr = [
        I18nT('ai.serviceStartedSuccessfully'),
        `${I18nT('ai.domain')}: <a href="javascript:void();" onclick="openUrl('${url}')">${url}</a>`
      ]
      if (url) {
        arr.push(I18nT('ai.alreadyOpenInBrowser'))
      }
      const aiStore = AIStore()
      aiStore.chatList.push({
        user: 'ai',
        content: arr.join('\n')
      })
      if (url) {
        nextTick().then(() => {
          setTimeout(() => {
            shell.openExternal(url)
          }, 1000)
        })
      }
      resolve(true)
    } catch (e: any) {
      const aiStore = AIStore()
      aiStore.chatList.push({
        user: 'ai',
        content: I18nT('ai.serviceStartFailed', { err: e.toString() })
      })
    }
  })
}
