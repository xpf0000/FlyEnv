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

  import LogVM from '@web/components/Log/index.vue'
  import ToolVM from '@web/components/Log/tool.vue'
  import { AppStore } from '@web/store/app'

  const { join } = require('path')

  const appStore = AppStore()
  const currentVersion = computed(() => {
    return appStore.config?.server?.mongodb?.current?.version
  })

  const log = ref()
  const filepath = computed(() => {
    if (!currentVersion?.value) {
      return ''
    }
    const v = currentVersion?.value?.split('.')?.slice(0, 2)?.join('.')
    return join(global.Server.MongoDBDir, `mongodb-${v}.log`)
  })
</script>
