<template>
  <li
    v-if="showItem.Memcached"
    :class="'non-draggable' + (currentPage === '/memcached' ? ' active' : '')"
    @click="emit('nav', '/memcached')"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon :svg="import('@/svg/memcached.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">Memcached</span>
    </div>

    <el-switch
      v-model="serviceRunning"
      :disabled="serviceDisabled"
      @click.stop="stopNav"
      @change="switchChange()"
    >
    </el-switch>
  </li>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { startService, stopService } from '@/util/Service'
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
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
    const current = appStore.config.server?.memcached?.current
    if (!current) {
      return undefined
    }
    const installed = brewStore?.memcached?.installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const serviceDisabled = computed(() => {
    return (
      !currentVersion?.value?.version ||
      brewStore?.memcached?.installed?.some((v) => v.running) ||
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
      if (showItem?.value?.Memcached && serviceRunning?.value && currentVersion?.value?.version) {
        all.push(stopService('memcached', currentVersion?.value))
      }
    } else {
      if (appStore.phpGroupStart?.[currentVersion?.value?.bin ?? ''] === false) {
        return all
      }
      if (showItem?.value?.Memcached && currentVersion?.value?.version) {
        all.push(startService('memcached', currentVersion?.value))
      }
    }
    return all
  }

  const switchChange = () => {
    let fn = null
      let promise: Promise<any> | null = null
      if (!currentVersion?.value?.version) return
      fn = serviceRunning?.value ? stopService : startService
      promise = fn('memcached', currentVersion?.value)
      promise?.then((res) => {
        if (typeof res === 'string') {
          MessageError(res)
        } else {
          MessageSuccess(I18nT('base.success'))
        }
      })
  }

  const stopNav = () => {}

  defineExpose({
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled
  })
</script>
