<template>
  <router-view />
  <FloatButton />
</template>

<script lang="ts" setup>
  import { computed, onUnmounted, ref, watch } from 'vue'
  import IPC from '@/util/IPC'
  import installedVersions from '@/util/InstalledVersions'
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import { I18nT } from '@shared/lang'
  import Base from '@/core/Base'
  import FloatButton from '@/components/FloatBtn/index.vue'
  import { type AllAppModule, AppModuleEnum } from '@/core/type'
  import { AppModules } from '@/core/App'

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

  const fetchModuleData = () => {
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

  onUnmounted(() => {
    IPC.off('application:about')
  })

  fetchModuleData()
</script>
