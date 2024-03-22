<template>
  <li
    v-if="showItem.Mysql"
    class="non-draggable"
    :class="'non-draggable' + (currentPage === '/mysql' ? ' active' : '')"
    @click="emit('nav', '/mysql')"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon :svg="import('@/svg/mysql.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">Mysql</span>
    </div>

    <el-switch v-model="serviceRunning" :disabled="serviceDisabled" @change="switchChange()">
    </el-switch>
  </li>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@web/store/app'
  import { BrewStore } from '@web/store/brew'
  import { I18nT } from '@shared/lang'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { MysqlStore } from '@web/store/mysql'
  import { startService, stopService } from '@web/fn'

  defineProps<{
    currentPage: string
  }>()

  const emit = defineEmits(['nav'])

  const appStore = AppStore()
  const brewStore = BrewStore()
  const mysqlStore = MysqlStore()

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem
  })

  const currentVersion = computed(() => {
    const current = appStore.config.server?.mysql?.current
    if (!current) {
      return undefined
    }
    const installed = brewStore?.mysql?.installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const serviceDisabled = computed(() => {
    return (
      !currentVersion?.value?.version ||
      brewStore?.mysql?.installed?.some((v) => v.running) ||
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
      if (showItem?.value?.Mysql && serviceRunning?.value && currentVersion?.value?.version) {
        all.push(stopService('mysql', currentVersion?.value))
      }
    } else {
      if (appStore.phpGroupStart?.[currentVersion?.value?.bin ?? ''] === false) {
        return all
      }
      if (showItem?.value?.Mysql && currentVersion?.value?.version) {
        all.push(startService('mysql', currentVersion?.value))
      }
    }
    return all
  }

  const switchChange = () => {
    let fn = null
    let groupFn: () => Promise<true | string>
    let promise: Promise<any> | null = null
    if (!currentVersion?.value?.version) return
    fn = serviceRunning?.value ? stopService : startService
    groupFn = serviceRunning?.value ? mysqlStore.groupStop : mysqlStore.groupStart
    promise = fn('mysql', currentVersion?.value)
    promise?.then((res) => {
      if (typeof res === 'string') {
        MessageError(res)
      } else {
        groupFn().then()
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
