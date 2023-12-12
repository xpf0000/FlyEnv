<template>
  <div class="block">
    <span class="left-title">{{ $t('base.selectVersion') }}</span>
    <el-select v-model="current" :disabled="disabled" class="ml-30">
      <template v-for="(item, index) in versions" :key="index">
        <template v-if="!item?.version">
          <el-tooltip
            :raw-content="true"
            :content="item?.error ?? $t('base.versionErrorTips')"
            popper-class="version-error-tips"
          >
            <el-option
              :disabled="true"
              :label="$t('base.versionError') + ' - ' + item.path"
              :value="$t('base.versionError') + ' - ' + item.path"
            >
            </el-option>
          </el-tooltip>
        </template>
        <template v-else>
          <el-option
            :label="item?.version + ' - ' + item.path"
            :value="item?.version + ' - ' + item.path"
          >
          </el-option>
        </template>
      </template>
    </el-select>
    <el-button
      :disabled="disabled || current === currentVersion"
      class="ml-20"
      :loading="currentTask.running"
      @click="versionChange"
      >{{ $t('base.switch') }}</el-button
    >
    <el-button :disabled="initing || disabled" class="ml-20" :loading="initing" @click="reinit">{{
      $t('base.refresh')
    }}</el-button>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import IPC from '@/util/IPC'
  import installedVersions from '@/util/InstalledVersions'
  import { BrewStore } from '@/store/brew'
  import { AppStore } from '@/store/app'
  import { TaskStore } from '@/store/task'
  import { ElMessage } from 'element-plus'
  import { I18nT } from '@shared/lang'

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
  }>()

  const current = ref('')
  const initing = ref(false)
  const logs = ref()

  const brewStore = BrewStore()
  const appStore = AppStore()
  const taskStore = TaskStore()
  const brewRunning = computed(() => {
    return brewStore.brewRunning
  })
  const server = computed(() => {
    return appStore.config.server
  })
  const versions = computed(() => {
    return brewStore?.[props.typeFlag]?.installed
  })
  const taskRunning = computed(() => {
    return versions?.value?.some((v) => v.running)
  })
  const disabled = computed(() => {
    return brewRunning?.value || taskRunning?.value
  })
  const currentTask = computed(() => {
    return taskStore?.[props.typeFlag]
  })
  const version = computed(() => {
    if (!props.typeFlag) {
      return {}
    }
    return server?.value?.[props.typeFlag]?.current ?? {}
  })
  const currentVersion = computed(() => {
    if (version?.value?.version) {
      const v = version?.value?.version
      const p = version?.value?.path
      return `${v} - ${p}`
    }
    return ''
  })

  const init = () => {
    if (initing?.value) {
      return
    }
    initing.value = true
    installedVersions.allInstalledVersions([props.typeFlag]).then(() => {
      initing.value = false
    })
  }

  const reinit = () => {
    const data = brewStore[props.typeFlag]
    data.installedInited = false
    init()
  }

  const getCurrenVersion = () => {
    current.value = currentVersion?.value
  }

  const log = computed(() => {
    return currentTask.value.log
  })

  const versionChange = () => {
    if (current?.value === currentVersion?.value) {
      return
    }
    log?.value?.splice(0)
    let data = versions?.value?.find((v) => {
      const txt = `${v.version} - ${v.path}`
      return txt === current?.value
    })
    if (!data) {
      return
    }
    data.run = false
    data.running = true
    const param = JSON.parse(JSON.stringify(data))
    IPC.send(`app-fork:${props.typeFlag}`, 'switchVersion', param).then((key: string, res: any) => {
      if (res.code === 0) {
        IPC.off(key)
        const appStore = AppStore()
        appStore.UPDATE_SERVER_CURRENT({
          flag: props.typeFlag,
          data: param
        })
        appStore.saveConfig()
        data!.run = true
        data!.running = false
        ElMessage.success(I18nT('base.success'))
      } else if (res.code === 1) {
        IPC.off(key)
        data!.running = false
        ElMessage.error(I18nT('base.fail'))
      } else if (res.code === 200) {
        log.value.push(res.msg)
      }
    })
  }

  if (taskRunning?.value) {
    log.value.splice(0)
  }
  getCurrenVersion()
  init()
</script>
