import BaseTask from '@/components/AI/Task/BaseTask'
import { BrewStore } from '@/store/brew'
import { AIStore } from '@/components/AI/store'
import { handleHost } from '@/util/Host'
import { openSiteBaseService } from '@/components/AI/Fn/Host'

const { existsSync } = require('fs-extra')

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
            content: '请输入或选择站点目录',
            action: 'ChooseSiteRoot'
          })
        },
        needInput: true,
        run: (dir: string) => {
          return new Promise(async (resolve, reject) => {
            if (!existsSync(dir)) {
              reject(new Error('站点目录无效，任务终止'))
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
            content: '请输入站点域名, 例如：www.test.com'
          })
        },
        needInput: true,
        run: (url: string) => {
          return new Promise(async (resolve, reject) => {
            url = url.split('://').pop()!
            try {
              new URL(`https://${url}`)
            } catch (e) {
              reject(new Error('域名无效，任务终止'))
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
            content: '创建站点中...'
          })
        },
        run: () => {
          return new Promise<any>((resolve, reject) => {
            const brewStore = BrewStore()
            const php = brewStore?.php?.installed?.find((i) => !!i.path && !!i.version)
            if (php?.num) {
              this.host.phpVersion = php.num
            }
            handleHost(this.host, 'add', undefined, false).then((res: true | string) => {
              if (res === true) {
                const aiStore = AIStore()
                aiStore.chatList.push({
                  user: 'ai',
                  content: `成功创建站点
站点域名: ${this.host.name}
站点目录: <a href="javascript:void();" onclick="openDir('${this.host.root}')">${this.host.root}</a>
尝试开启服务, 请稍候...`
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
