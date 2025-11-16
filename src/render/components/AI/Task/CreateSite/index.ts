import BaseTask from '@/components/AI/Task/BaseTask'
import { BrewStore } from '@/store/brew'
import { AIStore } from '@/components/AI/store'
import { handleHost } from '@/util/Host'
import { openSiteBaseService } from '@/components/AI/Fn/Host'
import { I18nT } from '@lang/index'
import { fs } from '@/util/NodeFn'

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
    phpVersion: undefined,
    phpVersionFull: undefined
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
        run: (dir: string) => {
          return new Promise(async (resolve, reject) => {
            const exists = await fs.existsSync(dir)
            if (!exists) {
              reject(new Error(I18nT('ai.siteDirectoryError')))
              return
            } else {
              this.host.root = dir
            }
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
            } catch {
              reject(new Error(I18nT('ai.domainError')))
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
          return new Promise<any>((resolve, reject) => {
            const brewStore = BrewStore()
            const php = brewStore.module('php').installed.find((i) => !!i.path && !!i.version)
            if (php?.num) {
              this.host.phpVersion = php.num
              this.host.phpVersionFull = php.version
            }
            handleHost(this.host, 'add', undefined, false).then((res: true | string) => {
              if (res === true) {
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
              } else {
                reject(new Error(res))
              }
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
