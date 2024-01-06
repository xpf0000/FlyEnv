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

const { shell } = require('@electron/remote')

export function addRandaSite(this: BaseTask) {
  return new Promise(async (resolve, reject) => {
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
站点目录: <a href="javascript:void();" onclick="openDir('${item.dir}')">${item.dir}</a>
尝试开启服务, 请稍候...`
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
    let current = appStore.config.server?.nginx?.current
    let installed = brewStore?.nginx?.installed
    const nginx = installed?.find((i) => i.path === current?.path && i.version === current?.version)

    current = appStore.config.server?.apache?.current
    installed = brewStore?.apache?.installed
    const apache = installed?.find(
      (i) => i.path === current?.path && i.version === current?.version
    )

    const php = brewStore?.php?.installed?.find(
      (i) => i.path === item?.php?.path && i.version === item?.php?.version
    )
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
        '服务启动成功',
        `域名: <a href="javascript:void();" onclick="openUrl('${url}')">${url}</a>`
      ]
      if (url) {
        arr.push('已在浏览器中打开，请查看')
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
        content: `服务启动失败, 原因:
                ${e.toString()}
                请尝试手动启动服务`
      })
    }
  })
}
