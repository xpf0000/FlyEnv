<template>
  <li
    v-if="showItem.Caddy !== false"
    :class="'non-draggable' + (currentPage === '/caddy' ? ' active' : '')"
    @click="emit('nav', '/caddy')"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon :svg="import('@/svg/caddy.svg?raw')" style="padding: 5px" width="28" height="28" />
      </div>
      <span class="title">Caddy</span>
    </div>

    <el-switch v-model="serviceRunning" :disabled="serviceDisabled" @change="switchChange()">
    </el-switch>
  </li>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { startService, stopService } from '@web/fn'
  import { AppStore } from '@web/store/app'
  import { BrewStore } from '@web/store/brew'
  import { I18nT } from '@shared/lang'
  import { MessageError, MessageSuccess } from '@/util/Element'

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
    const current = appStore.config.server?.caddy?.current
    if (!current) {
      return undefined
    }
    const installed = brewStore?.caddy?.installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const serviceDisabled = computed(() => {
    return (
      !currentVersion?.value?.version ||
      brewStore?.caddy?.installed?.some((v) => v.running) ||
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
      if (showItem?.value?.Caddy && serviceRunning?.value && currentVersion?.value?.version) {
        all.push(stopService('caddy', currentVersion?.value))
      }
    } else {
      if (appStore.phpGroupStart?.[currentVersion?.value?.bin ?? ''] === false) {
        return all
      }
      if (showItem?.value?.Caddy && currentVersion?.value?.version) {
        all.push(startService('caddy', currentVersion?.value))
      }
    }
    return all
  }

  const switchChange = () => {
    let fn = null
    let promise: Promise<any> | null = null
    if (!currentVersion?.value?.version) return
    fn = serviceRunning?.value ? stopService : startService
    promise = fn('caddy', currentVersion?.value)
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
