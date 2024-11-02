<template>
  <Conf
    ref="conf"
    :type-flag="'postgresql'"
    :default-file="defaultFile"
    :file="file"
    :file-ext="'conf'"
    :show-commond="false"
  >
  </Conf>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import { AppStore } from '@/store/app'

  const { join, dirname } = require('path')

  const appStore = AppStore()

  const currentVersion = computed(() => {
    return appStore.config?.server?.postgresql?.current?.version
  })

  const conf = ref()
  const file = computed(() => {
    if (!currentVersion.value) {
      return ''
    }
    const version = currentVersion?.value ?? ''
    const versionTop = version.split('.').shift()
    const dbPath = join(global.Server.PostgreSqlDir, `postgresql${versionTop}`)
    return join(dbPath, 'postgresql.conf')
  })

  const defaultFile = computed(() => {
    if (!file.value) {
      return ''
    }
    return join(dirname(file.value), `postgresql.conf.default`)
  })
</script>
