<template>
  <TitleBar />
  <router-view />
  <AI v-if="showAI" />
</template>

<script lang="ts" setup>
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
  import TitleBar from './components/Native/TitleBar.vue'
  import { EventBus } from './global'
  import { passwordCheck } from '@/util/Brew'
  import IPC from '@/util/IPC'
  import installedVersions from '@/util/InstalledVersions'
  import { AppSofts, AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import AI from '@/components/AI/index.vue'
  import { I18nT } from '@shared/lang'
  import Base from '@/core/Base'
  import { MessageSuccess } from '@/util/Element'

  const inited = ref(false)
  const appStore = AppStore()
  const brewStore = BrewStore()

  const lang = computed(() => {
    return appStore.config.setup.lang
  })

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem
  })

  const showAI = computed(() => {
    return appStore?.config?.setup?.showAIRobot ?? true
  })

  const showItemLowcase = () => {
    const dict: { [key: string]: boolean } = {}
    const all = showItem.value as any
    for (const k in all) {
      let key = k.toLowerCase()
      if (key === 'ftp') {
        key = 'pure-ftpd'
      }
      dict[key] = all[k] !== false
    }
    return dict
  }

  const onShowItemChange = () => {
    if (!inited.value) {
      return
    }
    const dict: { [key: string]: boolean } = showItemLowcase()
    const store: any = brewStore
    for (const k in dict) {
      const brewSoft = store?.[k]
      if (brewSoft && dict[k] && !brewSoft?.installedInited) {
        const flags = [k] as Array<keyof typeof AppSofts>
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

  const checkPassword = () => {
    passwordCheck().then(() => {
      checkProxy()
      const dict: { [key: string]: boolean } = showItemLowcase()
      console.log('showItem dict: ', dict)
      const flags: Array<keyof typeof AppSofts> = [
        'php',
        'caddy',
        'nginx',
        'mysql',
        'mariadb',
        'apache',
        'memcached',
        'redis',
        'mongodb',
        'pure-ftpd',
        'postgresql'
      ].filter((f) => dict?.[f] !== false) as Array<keyof typeof AppSofts>
      if (flags.length === 0) {
        AppStore().versionInited = true
        inited.value = true
        return
      }
      installedVersions.allInstalledVersions(flags).then(() => {
        AppStore().versionInited = true
        inited.value = true
      })
    })
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
        Base._Confirm(I18nT('tools.systemProxyChech'), undefined, {
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

  EventBus.on('vue:need-password', checkPassword)
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
    checkPassword()
    brewStore.cardHeadTitle = I18nT('base.currentVersionLib')
  })

  onUnmounted(() => {
    EventBus.off('vue:need-password', checkPassword)
    IPC.off('application:about')
  })
</script>
