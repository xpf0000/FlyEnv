import IPC from '@/util/IPC'
import { BrewStore } from '@/store/brew'

function handleServiceStatusChanged(res: any) {
  const flag = res?.flag
  if (!flag) {
    return
  }
  try {
    const brewStore = BrewStore()
    const module = brewStore.module(flag)
    if (!module) {
      return
    }
    // 按 bin 路径匹配——同一 version 可能装在不同位置，bin 才是实例唯一键
    const instances: Array<{ bin: string; path?: string; pid: string }> = res?.instances ?? []
    const runningByBin = new Map<string, { pid: string }>()
    instances.forEach((ins) => {
      if (ins?.bin) {
        runningByBin.set(ins.bin, { pid: ins.pid })
      }
    })
    module.installed.forEach((i: any) => {
      const hit = runningByBin.get(i.bin)
      if (hit) {
        i.run = true
        i.running = false
        if (hit.pid) {
          i.pid = `${hit.pid}`
        }
      } else {
        // 不在运行列表里 → 标记为停止
        i.run = false
        i.running = false
        i.pid = ''
      }
    })
  } catch (e) {
    console.log('service-status-changed handle error: ', e)
  }
}

function handleServiceInstalledNeedUpdate(res: any) {
  const flag = res?.flag
  const versions = Array.isArray(res?.versions) ? res.versions : []
  if (!flag) {
    return
  }
  try {
    const brewStore = BrewStore()
    const module = brewStore.module(flag)
    if (!module) {
      return
    }
    module.applyInstalledVersions(versions).catch()
  } catch (e) {
    console.log('service-installed-need-update handle error: ', e)
  }
}

export function setupMcpIpc() {
  IPC.on('APP-MCP-Notify').then((key: string, res: any) => {
    try {
      const type = res?.type
      if (type === 'service-status-changed') {
        handleServiceStatusChanged(res)
      } else if (type === 'service-installed-need-update') {
        handleServiceInstalledNeedUpdate(res)
      }
    } catch (e) {
      console.log('APP-MCP-Notify handle error: ', e)
    }
  })
}
