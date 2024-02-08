<template>
  <li
    v-if="showItem.FTP"
    class="non-draggable"
    :class="'non-draggable' + (currentPage === '/ftp' ? ' active' : '')"
    @click="emit('nav', '/ftp')"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon style="padding: 5px" :svg="import('@/svg/ftp.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">FTP</span>
    </div>

    <el-switch :disabled="serviceDisabled" :value="serviceRunning" @change="switchChange">
    </el-switch>
  </li>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@web/store/app'
  import { I18nT } from '@shared/lang'
  import { BrewStore } from '@web/store/brew'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { startService, stopService } from '@web/fn'

  defineProps<{
    currentPage: string
  }>()

  const emit = defineEmits(['nav'])

  const appStore = AppStore()
  const brewStore = BrewStore()

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem
  })

  const currentVersion = computed(() => {
    const current = appStore.config.server?.['pure-ftpd']?.current
    if (!current) {
      return undefined
    }
    const installed = brewStore?.['pure-ftpd']?.installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const serviceDisabled = computed(() => {
    return (
      !currentVersion?.value?.version ||
      brewStore?.['pure-ftpd']?.installed?.some((v) => v.running) ||
      !appStore.versionInited
    )
  })

  const serviceRunning = computed(() => {
    return currentVersion?.value?.run === true
  })

  const serviceFetching = computed(() => {
    return currentVersion?.value?.running === true
  })

  const groupDo = (isRunning: boolean): Array<Promise<string | boolean>> => {
    const all: Array<Promise<string | boolean>> = []
    if (isRunning) {
      if (showItem?.value?.FTP && serviceRunning?.value && currentVersion?.value?.version) {
        all.push(stopService('pure-ftpd', currentVersion?.value))
      }
    } else {
      if (showItem?.value?.FTP && currentVersion?.value?.version) {
        all.push(startService('pure-ftpd', currentVersion?.value))
      }
    }
    return all
  }

  const switchChange = () => {
    let fn = null
    let promise: Promise<any> | null = null
    if (!currentVersion?.value?.version) return
    fn = serviceRunning?.value ? stopService : startService
    promise = fn('pure-ftpd', currentVersion?.value)
    promise?.then((res) => {
      if (typeof res === 'string') {
        MessageError(res)
      } else {
        MessageSuccess(I18nT('base.success'))
      }
    })
  }

  defineExpose({
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled
  })
</script>
