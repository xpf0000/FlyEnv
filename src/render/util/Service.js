import IPC from '@/util/IPC.js'
import store from '@/store'
import Base from '@/core/Base.js'

const exec = (typeFlag, version, fn, status) => {
  const args = JSON.parse(JSON.stringify(version))
  const stat = store.getters['app/stat']
  const task = store.getters[`task/${typeFlag}`]
  if (task.running) {
    return
  }
  task.running = true
  task.log.splice(0)
  IPC.send(`app-fork:${typeFlag}`, fn, args).then((key, res) => {
    if (res.code === 0) {
      IPC.off(key)
      if (status !== undefined) {
        stat[typeFlag] = status
      }
      task.running = false
      Base.MessageSuccess('操作成功')
    } else if (res.code === 1) {
      IPC.off(key)
      task.log.push(res.msg)
      task.running = false
      Base.MessageError('操作失败')
    } else if (res.code === 200) {
      task.log.push(res.msg)
    }
  })
}

export const stopService = (typeFlag, version) => {
  exec(typeFlag, version, 'stopService', false)
}

export const startService = (typeFlag, version) => {
  exec(typeFlag, version, 'startService', true)
}

export const reloadService = (typeFlag, version) => {
  exec(typeFlag, version, 'reloadService')
}
