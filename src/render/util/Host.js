import IPC from '@/util/IPC.js'
import { reloadService } from '@/util/Service.js'
import store from '@/store'
import Base from '@/core/Base.js'
import { EventBus } from '@/global.js'

const handleHostEnd = (arr) => {
  const server = store.getters['app/server']
  const apacheRunning = store.getters['app/stat'].apache
  const apacheTaskRunning = store.getters['task/apache'].running
  if (apacheRunning && !apacheTaskRunning) {
    reloadService('apache', server.apache.current)
  }

  const nginxRunning = store.getters['app/stat'].nginx
  const nginxTaskRunning = store.getters['task/nginx'].running
  if (nginxRunning && !nginxTaskRunning) {
    reloadService('nginx', server.nginx.current)
  }
  const hosts = store.getters['app/hosts']
  hosts.splice(0)
  hosts.push(...arr)
  Base.MessageSuccess('操作成功')
  EventBus.emit('Host-Edit-Close')
}

export const handleHost = (host, flag, old = {}) => {
  return new Promise((resolve) => {
    host = JSON.parse(JSON.stringify(host))
    old = JSON.parse(JSON.stringify(old))
    IPC.send('app-fork:host', 'handleHost', host, flag, old).then((key, res) => {
      if (res.code === 0) {
        IPC.off(key)
        handleHostEnd(res.hosts)
        resolve(true)
      } else if (res.code === 1) {
        IPC.off(key)
        Base.MessageError(res.msg)
        resolve(false)
      }
    })
  })
}
