import BaseTask from '@/components/AI/Task/BaseTask'
import IPC from '@/util/IPC'
import { BrewStore } from '@/store/brew'
import { AIStore } from '@/components/AI/store'
import { AppStore } from '@/store/app'
import { startService } from '@/util/Service'

const { shell } = require('@electron/remote')

export class CreateSiteTest extends BaseTask {
  constructor() {
    super()
    this.task = [
      {
        run: () => {
          return new Promise<any>(async (resolve, reject) => {
            const appStore = AppStore()
            const brewStore = BrewStore()
            const php = brewStore.php.installed.find((p) => p.version) ?? {}
            IPC.send(`app-fork:host`, 'addRandaSite', JSON.parse(JSON.stringify(php))).then(
              (key: string, res: any) => {
                IPC.off(key)
                if (res.code === 0) {
                  appStore.initHost()
                  const item = res.data
                  const aiStore = AIStore()
                  aiStore.chatList.push({
                    user: 'ai',
                    content: `成功创建站点
站点域名: ${item.host}
站点目录: ${item.dir}
尝试开启服务, 请稍候...`
                  })
                  resolve(item)
                } else if (res.code === 1) {
                  reject(res.msg)
                }
              }
            )
          })
        }
      },
      {
        run: (item: any) => {
          return new Promise(async (resolve) => {
            const appStore = AppStore()
            const brewStore = BrewStore()
            let current = appStore.config.server?.nginx?.current
            let installed = brewStore?.nginx?.installed
            const nginx = installed?.find(
              (i) => i.path === current?.path && i.version === current?.version
            )

            current = appStore.config.server?.apache?.current
            installed = brewStore?.apache?.installed
            const apache = installed?.find(
              (i) => i.path === current?.path && i.version === current?.version
            )

            const php = brewStore?.php?.installed?.find(
              (i) => i.path === item?.version?.path && i.version === item?.version?.version
            )
            try {
              let url = ''
              if (nginx && (!apache || !apache?.run)) {
                await startService('nginx', JSON.parse(JSON.stringify(nginx)))
                url = `http://${item.host}`
              } else if (apache && (!nginx || !nginx?.run)) {
                await startService('apache', JSON.parse(JSON.stringify(apache)))
                url = `http://${item.host}:8080`
              }
              if (php) {
                await startService('php', JSON.parse(JSON.stringify(php)))
              }
              const arr = ['服务启动成功', `域名: ${url}`]
              if (url) {
                shell.openExternal(url)
                arr.push('已在浏览器中打开，请查看')
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
                content: `服务启动失败, 原因:
                ${e.toString()}
                请尝试手动启动服务`
              })
            }
          })
        }
      }
    ]
  }
}
