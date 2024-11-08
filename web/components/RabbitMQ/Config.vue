<template>
  <Conf
    ref="conf"
    :type-flag="'rabbitmq'"
    :default-file="defaultFile"
    :file="file"
    :file-ext="'conf'"
    :show-commond="false"
  >
  </Conf>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import Conf from '@web/components/Conf/index.vue'
  import { AppStore } from '@web/store/app'
  import IPC from '@/util/IPC'
  import { BrewStore } from '@web/store/brew'

  const { join } = require('path')

  const appStore = AppStore()
  const brewStore = BrewStore()
  const file = ref('')

  const currentVersion = computed(() => {
    const current = appStore.config.server?.rabbitmq?.current
    const installed = brewStore.module('rabbitmq').installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const conf = ref()

  const defaultFile = computed(() => {
    if (!currentVersion.value) {
      return ''
    }
    const v = currentVersion?.value?.version?.split('.')?.[0] ?? ''
    return join(global.Server.BaseDir, 'rabbitmq', `rabbitmq-${v}-default.conf`)
  })

  watch(
    currentVersion,
    (v) => {
      if (v && !file.value) {
        IPC.send('app-fork:rabbitmq', 'initConfig', JSON.parse(JSON.stringify(v))).then(
          (key: string, res: any) => {
            IPC.off(key)
            if (res?.data) {
              file.value = res.data
            }
          }
        )
      }
    },
    {
      immediate: true
    }
  )
</script>
