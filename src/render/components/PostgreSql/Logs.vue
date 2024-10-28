<template>
  <div class="module-config">
    <el-card>
      <LogVM ref="log" :log-file="filepath" />
      <template #footer>
        <ToolVM :log="log" />
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'

  const { join } = require('path')

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

  const log = ref()
  const filepath = computed(() => {
    if (!currentVersion?.value) {
      return ''
    }
    const version = currentVersion.value?.version
    const versionTop = version?.split('.')?.shift()
    const dbPath = join(global.Server.PostgreSqlDir, `postgresql${versionTop}`)
    return join(dbPath, 'pg.log')
  })
</script>
