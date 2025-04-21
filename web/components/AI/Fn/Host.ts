import type BaseTask from '@web/components/AI/Task/BaseTask'
import { AppStore } from '@web/store/app'
import { BrewStore } from '@web/store/brew'
import { AIStore } from '@web/components/AI/store'
import { startNginx } from '@web/components/AI/Fn/Nginx'
import { startApache } from '@web/components/AI/Fn/Apache'
import { startPhp } from '@web/components/AI/Fn/Php'
import type { SoftInstalled } from '@shared/app'
import { fetchInstalled } from '@web/components/AI/Fn/Util'
import { I18nT } from '@shared/lang'
import { waitTime } from '@web/fn'

export function addRandaSite(this: BaseTask) {
  return new Promise(async (resolve) => {
    waitTime().then(() => {
      const aiStore = AIStore()
      aiStore.chatList.push({
        user: 'ai',
        content: `${I18nT('ai.siteCreatedSuccessfully')}
${I18nT('ai.siteDomain')}: mydomain.tld
${I18nT('ai.siteDirectory')}: <a href="javascript:void();" onclick="openDir('xxxx')">xxxx</a>
${I18nT('ai.tryingToStartService')}`
      })
      resolve({
        host: 'mydomain.tld',
        php: '8.3.0'
      })
    })
  })
}

export function openSiteBaseService(this: BaseTask, item: { host: string; php: SoftInstalled }) {
  return new Promise(async (resolve) => {
    await fetchInstalled(['apache'])
    await fetchInstalled(['nginx'])
    await fetchInstalled(['php'])
    const appStore = AppStore()
    const brewStore = BrewStore()
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
