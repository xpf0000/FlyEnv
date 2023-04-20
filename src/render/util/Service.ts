import IPC from '@/util/IPC'
import type { SoftInstalled } from '@/store/brew'
import { AppSofts, AppStore } from '@/store/app'
import { TaskStore } from '@/store/task'

const exec = (
  typeFlag: keyof typeof AppSofts,
  version: SoftInstalled,
  fn: string
): Promise<string | boolean> => {
  return new Promise((resolve) => {
    if (version.running) {
      resolve(true)
      return
    }
    version.running = true
    const args = JSON.parse(JSON.stringify(version))
    const appStore = AppStore()
    const taskStore = TaskStore()
    const task = taskStore[typeFlag]
    task.log.splice(0)
    IPC.send(`app-fork:${typeFlag}`, fn, args).then((key: string, res: any) => {
      if (res.code === 0) {
        IPC.off(key)
        version.run = fn !== 'stopService'
        version.running = false
        if (typeFlag === 'php' && fn === 'startService') {
          const hosts = appStore.hosts
          if (hosts && hosts?.[0] && !hosts?.[0]?.phpVersion) {
            appStore.initHost().then()
          }
        }
        resolve(true)
      } else if (res.code === 1) {
        IPC.off(key)
        task.log.push(res.msg)
        version.running = false
        resolve(task.log.join('\n'))
      } else if (res.code === 200) {
        task.log.push(res.msg)
      }
    })
  })
}

export const stopService = (typeFlag: keyof typeof AppSofts, version: SoftInstalled) => {
  return exec(typeFlag, version, 'stopService')
}

export const startService = (typeFlag: keyof typeof AppSofts, version: SoftInstalled) => {
  return exec(typeFlag, version, 'startService')
}

export const reloadService = (typeFlag: keyof typeof AppSofts, version: SoftInstalled) => {
  return exec(typeFlag, version, 'reloadService')
}
