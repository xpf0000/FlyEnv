import IPC from '@/util/IPC.js'
import store from '@/store'

const exec = (typeFlag, version, fn, status) => {
  return new Promise((resolve) => {
    if (version.running) {
      resolve(true)
      return
    }
    version.running = true
    const args = JSON.parse(JSON.stringify(version))
    const stat = store.getters['app/stat']
    const task = store.getters[`task/${typeFlag}`]
    task.log.splice(0)
    IPC.send(`app-fork:${typeFlag}`, fn, args).then((key, res) => {
      if (res.code === 0) {
        IPC.off(key)
        if (status !== undefined) {
          stat[typeFlag] = status
        }
        version.run = fn !== 'stopService'
        version.running = false
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

export const stopService = (typeFlag, version) => {
  return exec(typeFlag, version, 'stopService', false)
}

export const startService = (typeFlag, version) => {
  return exec(typeFlag, version, 'startService', true)
}

export const reloadService = (typeFlag, version) => {
  return exec(typeFlag, version, 'reloadService', undefined)
}
