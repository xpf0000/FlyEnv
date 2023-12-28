<template>
  <div class="apache-service">
    <VersionSwitch :type-flag="typeFlag"></VersionSwitch>

    <div class="block mt-20">
      <span class="left-title">{{ $t('base.currentVersion') }}</span>
      <span
        class="ml-30 version-txt"
        :class="{ disabled: !currentVersion?.version }"
        v-text="versionTxt"
      ></span>
    </div>

    <div class="block mt-20">
      <span class="left-title">{{ $t('base.currentStatus') }}</span>
      <div v-if="serverRunning" class="ml-30 status running">
        <span class="mr-10">{{ $t('base.runningStatus') }}</span>
        <yb-icon :svg="import('@/svg/task-start.svg?raw')" width="16" height="16" />
      </div>
      <div v-else class="ml-30 status">
        <span class="mr-10">{{ $t('base.noRunningStatus') }}</span>
        <yb-icon :svg="import('@/svg/task-stop.svg?raw')" width="16" height="16" />
      </div>
    </div>

    <div class="block mt-30">
      <el-button
        v-if="serverRunning"
        :loading="current_task === 'stop'"
        :disabled="disabled"
        @click="serviceDo('stop')"
        >{{ $t('base.serviceStop') }}</el-button
      >
      <el-button
        v-else
        :loading="current_task === 'start'"
        :disabled="disabled"
        @click="serviceDo('start')"
        >{{ $t('base.serviceStart') }}</el-button
      >
      <el-button
        :loading="current_task === 'restart'"
        :disabled="disabled"
        class="ml-30"
        @click="serviceDo('restart')"
        >{{ $t('base.serviceReStart') }}</el-button
      >
      <el-button
        v-if="showReloadBtn"
        :loading="current_task === 'reload'"
        :disabled="disabled || !serverRunning"
        class="ml-30"
        @click="serviceDo('reload')"
        >{{ $t('base.serviceReLoad') }}</el-button
      >
    </div>

    <div ref="logRef" class="logs mt-20 cli-to-html">
      {{ logHtml }}
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { ref, computed, watch, nextTick } from 'vue'
  import { reloadService, startService, stopService } from '@/util/Service'
  import { AppSofts, AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import { TaskStore } from '@/store/task'
  import { I18nT } from '@shared/lang'
  import VersionSwitch from '../VersionSwtich/index.vue'
  import { MessageError, MessageSuccess } from '@/util/Element'

  const props = defineProps<{
    typeFlag:
      | 'nginx'
      | 'apache'
      | 'memcached'
      | 'mysql'
      | 'mariadb'
      | 'redis'
      | 'php'
      | 'mongodb'
      | 'pure-ftpd'
      | 'postgresql'
  }>()

  const appStore = AppStore()
  const brewStore = BrewStore()
  const taskStore = TaskStore()
  const current_task = ref('')
  const logRef = ref()

  const showReloadBtn = computed(() => {
    return (
      props.typeFlag !== 'memcached' &&
      props.typeFlag !== 'mongodb' &&
      props.typeFlag !== 'redis' &&
      props.typeFlag !== 'postgresql'
    )
  })

  const version = computed(() => {
    const flag: keyof typeof AppSofts = props.typeFlag as any
    return appStore.config.server[flag].current
  })

  const currentVersion = computed(() => {
    const flag: keyof typeof AppSofts = props.typeFlag as any
    return brewStore[flag].installed?.find(
      (i) => i.path === version?.value?.path && i.version === version?.value?.version
    )
  })

  const currentTask = computed(() => {
    const flag: keyof typeof AppSofts = props.typeFlag as any
    return taskStore[flag]
  })

  const isRunning = computed(() => {
    return currentVersion?.value?.running
  })

  const logs = computed(() => {
    return currentTask.value.log
  })

  const logHtml = computed(() => {
    return logs.value.join('')
  })

  const logLength = computed(() => {
    return logs?.value?.length
  })

  const serverRunning = computed(() => {
    return currentVersion?.value?.run
  })

  const disabled = computed(() => {
    const flag: keyof typeof AppSofts = props.typeFlag as any
    return (
      brewStore[flag].installed?.some((i) => i.running) ||
      !currentVersion?.value?.version ||
      !currentVersion?.value?.path
    )
  })

  const versionTxt = computed(() => {
    const v = currentVersion?.value?.version
    const p = currentVersion?.value?.path
    if (v && p) {
      return `${v} - ${p}`
    }
    return I18nT('base.noVersionTips')
  })

  watch(isRunning, (nv) => {
    if (!nv) {
      current_task.value = ''
    }
  })

  watch(logLength, () => {
    nextTick().then(() => {
      let container: HTMLElement = logRef.value as any
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    })
  })

  if (!isRunning.value) {
    logs.value.splice(0)
  }

  const serviceDo = (flag: string) => {
    if (!currentVersion?.value?.version || !currentVersion?.value?.path) {
      return
    }
    logs.value.splice(0)
    current_task.value = flag
    const typeFlag: keyof typeof AppSofts = props.typeFlag as any
    let action: any
    switch (flag) {
      case 'stop':
        action = stopService(typeFlag, currentVersion.value)
        break
      case 'start':
      case 'restart':
        action = startService(typeFlag, currentVersion.value)
        break
      case 'reload':
        action = reloadService(typeFlag, currentVersion.value)
        break
    }
    action.then((res: any) => {
      if (typeof res === 'string') {
        MessageError(res)
      } else {
        MessageSuccess(I18nT('base.success'))
      }
    })
  }
</script>

<style lang="scss">
  .apache-service {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 40px 0 0 40px;
    .block {
      display: flex;
      flex-shrink: 0;
      align-items: center;

      > .left-title {
        flex-shrink: 0;
        margin-right: 5px;
      }

      .version-txt.disabled {
        color: #f56c6c;
      }

      .status {
        display: flex;
        align-items: center;

        &.running {
          color: #01cc74;
        }
      }
    }
    .logs {
      flex: 1;
      width: 100%;
      display: flex;
      flex-direction: column;
      overflow: auto;
      > li {
        width: 100%;
        word-break: break-word;
      }
    }
  }
</style>
