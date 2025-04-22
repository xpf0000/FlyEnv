import BaseTask from '@web/components/AI/Task/BaseTask'
import { BrewStore } from '@web/store/brew'
import { AIStore } from '@web/components/AI/store'
import { openSiteBaseService } from '@web/components/AI/Fn/Host'
import { I18nT } from '@shared/lang'
import { waitTime } from '@web/fn'

export class CreateSite extends BaseTask {
  host: any = {
    id: new Date().getTime(),
    name: '',
    alias: '',
    useSSL: false,
    ssl: {
      cert: '',
      key: ''
    },
    port: {
      nginx: 80,
      apache: 8080,
      nginx_ssl: 443,
      apache_ssl: 8443
    },
    nginx: {
      rewrite: ''
    },
    url: '',
    root: '',
    mark: '',
    phpVersion: undefined
  }
  constructor() {
    super()
    this.task = [
      {
        content: () => {
          const aiStore = AIStore()
          aiStore.chatList.push({
            user: 'ai',
            content: I18nT('ai.enterOrSelectSiteDirectory'),
            action: 'ChooseSiteRoot'
          })
        },
        needInput: true,
        run: () => {
          return new Promise(async (resolve) => {
            await waitTime()
            resolve(true)
          })
        }
      },
      {
        content: () => {
          const aiStore = AIStore()
          aiStore.chatList.push({
            user: 'ai',
            content: I18nT('ai.enterSiteDomain')
          })
        },
        needInput: true,
        run: (url: string) => {
          return new Promise(async (resolve, reject) => {
            url = url.split('://').pop()!
            try {
              new URL(`https://${url}`)
            } catch (e) {
              reject(new Error(I18nT('ai.domain无效')))
            }
            this.host.name = url
            resolve(true)
          })
        }
      },
      {
        content: () => {
          const aiStore = AIStore()
          aiStore.chatList.push({
            user: 'ai',
            content: I18nT('ai.creatingSite')
          })
        },
        run: () => {
          return new Promise<any>((resolve) => {
            const brewStore = BrewStore()
            const php = brewStore.module('php').installed.find((i) => !!i.path && !!i.version)
            if (php?.num) {
              this.host.phpVersion = php.num
            }
            const aiStore = AIStore()
            aiStore.chatList.push({
              user: 'ai',
              content: `${I18nT('ai.siteCreatedSuccessfully')}
              ${I18nT('ai.siteDomain')}: ${this.host.name}
              ${I18nT('ai.siteDirectory')}: <a href="javascript:void();" onclick="openDir('${this.host.root}')">${
                this.host.root
              }</a>
              ${I18nT('ai.tryingToStartService')}`
            })
            resolve({
              host: this.host.name,
              php
            })
          })
        }
      },
      {
        run: openSiteBaseService.bind(this)
      }
    ]
  }
}
