<template>
  <li
    v-if="showItem?.PostgreSql !== false"
    :class="'non-draggable' + (currentPage === '/postpresql' ? ' active' : '')"
    @click="emit('nav', '/postpresql')"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon :svg="import('@/svg/postgresql.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">PostpreSql</span>
    </div>

    <el-switch :disabled="serviceDisabled" :value="serviceRunning" @change="switchChange">
    </el-switch>
  </li>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { startService, stopService } from '@/util/Service'
  import { passwordCheck } from '@/util/Brew'
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import { ElMessage } from 'element-plus'
  import { I18nT } from '@shared/lang'

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
    const current = appStore.config.server?.postpresql?.current
    if (!current) {
      return undefined
    }
    const installed = brewStore?.postpresql?.installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const serviceDisabled = computed(() => {
    return (
      !currentVersion?.value?.version ||
      brewStore?.postpresql?.installed?.some((v) => v.running) ||
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
      if (showItem?.value?.PostgreSql && serviceRunning?.value && currentVersion?.value?.version) {
        all.push(stopService('postpresql', currentVersion?.value))
      }
    } else {
      if (showItem?.value?.PostgreSql && currentVersion?.value?.version) {
        all.push(startService('postpresql', currentVersion?.value))
      }
    }
    return all
  }

  const switchChange = () => {
    passwordCheck().then(() => {
      let fn = null
      let promise: Promise<any> | null = null
      if (!currentVersion?.value?.version) return
      fn = serviceRunning?.value ? stopService : startService
      promise = fn('postpresql', currentVersion?.value)
      promise?.then((res) => {
        if (typeof res === 'string') {
          ElMessage.error(res)
        } else {
          ElMessage.success(I18nT('base.success'))
        }
      })
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
