<template>
  <TitleBar />
  <VueSvg />
  <router-view />
  <FloatButton />
</template>

<script lang="ts" setup>
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
  import TitleBar from './components/Native/TitleBar.vue'
  import IPC from '@/util/IPC'
  import installedVersions from '@/util/InstalledVersions'
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import { I18nT } from '@lang/index'
  import Base from '@/core/Base'
  import { MessageSuccess } from '@/util/Element'
  import FloatButton from '@/components/FloatBtn/index.vue'
  import { type AllAppModule, AppModuleEnum } from '@/core/type'
  import { AppModules } from '@/core/App'
  import VueSvg from '@/components/VueSvgIcon/svg.vue'

  const inited = ref(false)
  const appStore = AppStore()
  const brewStore = BrewStore()

  const lang = computed(() => {
    return appStore.config.setup.lang
  })

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem
  })

  const allService = AppModules.filter((m) => m.isService).map((m) => m.typeFlag)

  const needFetch: number[] = []

  const onShowItemChange = () => {
    if (!inited.value) {
      needFetch.push(1)
      return
    }
    let k: AllAppModule
    for (k of allService) {
      const module = brewStore.module(k)
      if (showItem?.value?.[k] !== false && !module.installedInited) {
        const flags = [k]
        installedVersions.allInstalledVersions(flags)
      }
    }
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
      appStore.versionInited = true
      inited.value = true
      if (needFetch.length > 0) {
        needFetch.pop()
        onShowItemChange()
      }
      return
    }
    installedVersions.allInstalledVersions(flags).then(() => {
      appStore.versionInited = true
      inited.value = true
      if (needFetch.length > 0) {
        needFetch.pop()
        onShowItemChange()
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

  watch(
    showItem,
    () => {
      onShowItemChange()
    },
    {
      deep: true
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
</script>
