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
  import { PostgreSqlSetup } from '@/components/PostgreSql/setup'
  import { BrewStore } from '@/store/brew'

  const { join, dirname } = require('path')

  const appStore = AppStore()
  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    const current = appStore.config.server?.postgresql?.current
    if (!current) {
      return undefined
    }
    const installed = brewStore.module('postgresql').installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const conf = ref()
  const file = computed(() => {
    if (!currentVersion.value) {
      return ''
    }
    let dbPath = ''

    if (currentVersion?.value?.bin) {
      if (PostgreSqlSetup.dir[currentVersion.value.bin]) {
        dbPath = PostgreSqlSetup.dir[currentVersion.value.bin]
      } else {
        const versionTop = currentVersion?.value?.version?.split('.')?.shift() ?? ''
        dbPath = join(global.Server.PostgreSqlDir!, `postgresql${versionTop}`)
      }
    } else {
      return ''
    }

    return join(dbPath, 'postgresql.conf')
  })

  const defaultFile = computed(() => {
    if (!file.value) {
      return ''
    }
    return join(dirname(file.value), `postgresql.conf.default`)
  })
</script>
