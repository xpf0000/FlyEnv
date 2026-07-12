import { AppI18n } from '@lang/index'
import BaseManager from './BaseManager'
import { appDebugLog } from '@shared/utils'
import { ProcessSendError } from './Fn'
import { StopProcessListClient } from './StopProcessListClient'
import { setStopProcessListProvider } from '@shared/StopProcessList'
import { BinVersionCacheClient } from './BinVersionCacheClient'
import { setBinVersionCacheProvider } from './util/BinVersionCache'

const parentPort = process.parentPort
const stopProcessListClient = parentPort
  ? new StopProcessListClient((message) => parentPort.postMessage(message))
  : undefined
const binVersionCacheClient = parentPort
  ? new BinVersionCacheClient((message) => parentPort.postMessage(message))
  : undefined

if (stopProcessListClient) {
  setStopProcessListProvider(() => stopProcessListClient.request())
}

if (binVersionCacheClient) {
  setBinVersionCacheProvider({
    get: (fingerprint) => binVersionCacheClient.get(fingerprint),
    set: (fingerprint, value) => binVersionCacheClient.set(fingerprint, value)
  })
}

// ---------------------- 兼容层开始 ----------------------
// 只有在 electron 环境下且存在 parentPort 时才执行兼容逻辑
if (parentPort) {
  // 1. 挂载 send 方法：让内部调用的 process.send 变为 process.parentPort.postMessage
  // @ts-ignore: 忽略 TS 对 process 上不存在 send 方法的报错
  if (!process.send) {
    // @ts-ignore
    process.send = (message: any) => {
      parentPort.postMessage(message)
      return true // Node.js 的 process.send 返回 boolean
    }
  }

  // 2. 转发 message 事件：让 process.on('message') 也能收到消息
  // 这样你连入口的监听逻辑都不用改成 parentPort.on
  parentPort.on('message', (e) => {
    const data = e.data
    if (stopProcessListClient?.handleMessage(data)) {
      return
    }
    if (binVersionCacheClient?.handleMessage(data)) {
      return
    }
    // 将 electron 的消息结构 e.data 转发给 node 的标准事件
    // @ts-ignore
    process.emit('message', data)
  })
}
// ---------------------- 兼容层结束 ----------------------

const manager = new BaseManager()

// ↓↓↓↓ 下面这里的代码完全不用动，保持原来的 child_process 写法即可 ↓↓↓↓
process.on('message', function (args: any) {
  if (args.Server) {
    global.Server = args.Server
    if (global.Server.LangCustomer) {
      AppI18n().global.setLocaleMessage(global.Server.Lang!, global.Server.LangCustomer)
    }
    AppI18n(args.Server.Lang)
    manager.init()
  } else {
    // 假设 manager 内部使用了 process.send，现在也能正常工作了
    manager
      .exec(args)
      .then()
      .catch((error) => {
        if (Array.isArray(args) && args.length > 0) {
          const ipcCommandKey = args[0]
          ProcessSendError(ipcCommandKey, `${error}`)
        }
        appDebugLog(
          '[Fork][exec][error]',
          `${JSON.stringify({
            args,
            error
          })}`
        ).catch()
      })
  }
})

export {}
