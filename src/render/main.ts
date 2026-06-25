import { reactive } from 'vue'
import { VueExtend } from './core/VueExtend'
import { AppI18n } from '@lang/index'
import App from './App.vue'
import './index.scss'
import IPC from '@/util/IPC'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import { SiteSuckerStore } from '@/components/Tools/SiteSucker/store'
import './style/index.scss'
import './style/dark.scss'
import './style/light.scss'
import { ThemeInit } from '@/util/Theme'
import { AppToolStore } from '@/components/Tools/store'
import { SetupStore } from '@/components/Setup/store'
import { AppLogStore } from '@/components/AppLog/store'
import { AppCustomerModule } from '@/core/Module'
import { lang, nativeTheme } from '@/util/NodeFn'
import { MessageError, MessageSuccess, MessageWarning } from '@/util/Element'
import { FlyEnvHelperSetup } from '@/components/FlyEnvHelper/setup'
import { isEqual } from 'lodash-es'
import CapturerSetup from '@/components/Tools/Capturer/setup'
import HelperStore from '@/store/helper'

window.Server = reactive({}) as any

const appRoot = VueExtend(App)
lang.loadCustomerLang().then().catch()

let inited = false
IPC.on('APP-Ready-To-Show').then((key: string, res: any) => {
  console.log('APP-Ready-To-Show !!!!!!', key, res)
  Object.assign(window.Server, res)
  if (!inited) {
    inited = true
    const store = AppStore()
    store.envIndex += 1
    AppCustomerModule.init()
    store
      .initConfig()
      .then(() => {
        ThemeInit()
        const config = store.config.setup
        AppI18n(config?.lang)
        appRoot.mount('#app')
      })
      .catch()
    SiteSuckerStore().init()
    AppToolStore.init()
    SetupStore()
      .init()
      .then(() => {
        CapturerSetup.init()
      })
    AppLogStore.init().then().catch()
  } else {
    console.log('has inited !!!!')
  }
})
IPC.on('App-Native-Theme-Update').then(() => {
  nativeTheme.updateFn.forEach((fn: () => void) => {
    fn()
  })
})
IPC.on('APP-Update-Global-Server').then((key: string, res: any) => {
  console.log('APP-Update-Global-Server: ', key, res)
  const server: any = window.Server
  if (isEqual(server, res)) {
    return
  }
  for (const key in server) {
    delete server?.[key]
  }
  Object.assign(window.Server, res)
  const store = AppStore()
  store.envIndex += 1
})
IPC.on('APP-User-UUID-Need-Update').then((key: string, res: any) => {
  if (res?.code === 0) {
    const store = SetupStore()
    store.githubUser = res?.data?.user
    store.githubLicense = res?.data?.license
    store.githubInfoSave()
  }
})
IPC.on('APP-License-Need-Update').then(() => {
  SetupStore().init()
})
IPC.on('APP-Service-Status-Changed').then((key: string, res: any) => {
  // 主进程 ServiceProcessManager 状态变更广播（MCP / 托盘 / 其它窗口发起的启停）
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
    console.log('APP-Service-Status-Changed handle error: ', e)
  }
})
IPC.on('APP-FlyEnv-Helper-Notice').then((key: string, res: any) => {
  if (res?.code === 0) {
    MessageSuccess(res?.msg)
  } else if (res.code === 1) {
    MessageError(res?.msg)
    if (res?.status === 'installFaild' && inited && !FlyEnvHelperSetup.show) {
      HelperStore.showInstallFailDialog()
    } else if (!res?.status) {
      HelperStore.showNeedInstallDialog()
    }
  } else if (res.code === 2) {
    MessageWarning(res?.msg)
  }
})
