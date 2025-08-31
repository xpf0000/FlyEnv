<template>
  <TitleBar />
  <VueSvg />
  <router-view />
  <FloatButton />
</template>

<script lang="ts" setup>
  import { computed, onMounted, onUnmounted, reactive, watch } from 'vue'
  import TitleBar from './components/Native/TitleBar.vue'
  import IPC from '@/util/IPC'
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import { I18nT } from '@lang/index'
  import Base from '@/core/Base'
  import { MessageSuccess } from '@/util/Element'
  import FloatButton from '@/components/FloatBtn/index.vue'
  import { AppModules } from '@/core/App'
  import VueSvg from '@/components/VueSvgIcon/svg.vue'
  import { Module } from '@/core/Module/Module'
  import type { AllAppModule, AppModuleEnum } from '@/core/type'
  import { shell } from '@/util/NodeFn'

  const appStore = AppStore()
  const brewStore = BrewStore()

  const lang = computed(() => {
    return appStore.config.setup.lang
  })

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem
  })

  const allService = AppModules.filter((m) => m.isService).map((m) => m.typeFlag)

  for (const item of AppModules) {
    const module = reactive(new Module())
    module.typeFlag = item.typeFlag
    module.isService = item?.isService ?? false
    module.isOnlyRunOne = item?.isOnlyRunOne !== false
    module.fetchInstalled = module.fetchInstalled.bind(module)
    module.onItemStart = module.onItemStart.bind(module)
    module.fetchBrew = module.fetchBrew.bind(module)
    module.fetchPort = module.fetchPort.bind(module)
    module.fetchStatic = module.fetchStatic.bind(module)
    module.start = module.start.bind(module)
    module.stop = module.stop.bind(module)
    module.watchShowHide = module.watchShowHide.bind(module)
    brewStore.modules[module.typeFlag] = module
    module?.watchShowHide?.()
  }

  const showAbout = () => {
    Base.Dialog(import('./components/About/index.vue'))
      .className('about-dialog')
      .title(I18nT('base.about'))
      .width('665px')
      .noFooter()
      .show()
  }

  const init = () => {
    checkProxy()
    const flags: Array<AllAppModule> = allService.filter(
      (f: AllAppModule) => showItem?.value?.[f] !== false
    ) as Array<keyof typeof AppModuleEnum>
    if (flags.length === 0) {
      appStore.versionInitiated = true
      for (const typeFlag in brewStore.modules) {
        const moduleKey = typeFlag as AllAppModule
        const module = brewStore.modules[moduleKey]
        module?.watchShowHide?.()
      }
      return
    }
    const modules = Object.values(brewStore.modules)
    const all: Promise<boolean>[] = modules
      .filter((f) => flags.includes(f.typeFlag))
      .map((i) => {
        return i.fetchInstalled()
      })
    Promise.all(all).then(() => {
      appStore.versionInitiated = true
      console.log('appStore.versionInitiated true !!!')
      for (const typeFlag in brewStore.modules) {
        const moduleKey = typeFlag as AllAppModule
        const module = brewStore.modules[moduleKey]
        module?.watchShowHide?.()
      }
    })
    if (appStore.hosts.length === 0) {
      appStore.initHost().then()
    }
  }

  const checkProxy = () => {
    if (appStore?.config?.setup?.proxy?.on) {
      return
    }
    const checked = localStorage.getItem('PhpWebStudy-Checked-Proxy')
    if (checked) {
      return
    }
    IPC.send('app-fork:tools', 'sysetmProxy').then((key: string, res: any) => {
      IPC.off(key)
      console.log('sysetmProxy: ', res)
      const proxy = res?.data ?? {}
      if (Object.keys(proxy).length > 0) {
        Base._Confirm(I18nT('tools.systemProxyCheck'), undefined, {
          customClass: 'confirm-del',
          type: 'warning'
        }).then(() => {
          const arr: string[] = ['export']
          for (const k in proxy) {
            arr.push(`${k}=${proxy[k]}`)
          }
          appStore.config.setup.proxy.on = true
          appStore.config.setup.proxy.proxy = arr.join(' ')
          appStore.saveConfig()
          MessageSuccess(I18nT('tools.systemProxyUsed'))
        })
        localStorage.setItem('PhpWebStudy-Checked-Proxy', 'true')
      }
    })
  }

  IPC.on('application:about').then(showAbout)

  watch(
    lang,
    (val) => {
      const body = document.body
      body.className = `lang-${val}`
    },
    {
      immediate: true
    }
  )

  onMounted(() => {
    init()
    brewStore.cardHeadTitle = I18nT('base.currentVersionLib')
  })

  onUnmounted(() => {
    IPC.off('application:about')
    IPC.off('application:need-password')
  })

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      e.preventDefault()
    }
  })

  const openDir = (dir: string) => {
    shell.openPath(dir)
  }
  const openUrl = (url: string) => {
    shell.openExternal(url)
  }

  window.openDir = openDir
  window.openUrl = openUrl
</script>
