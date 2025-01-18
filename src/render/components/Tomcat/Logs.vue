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

  const { join } = require('path')

  const appStore = AppStore()

  const currentVersion = computed(() => {
    return appStore.config.server?.tomcat?.current
  })

  const currentBaseDir = computed(() => {
    const v = currentVersion?.value?.version?.split('.')?.shift() ?? ''
    return join(global.Server.BaseDir!, `tomcat/tomcat${v}`)
  })

  const log = ref()
  const filepath = computed(() => {
    if (!currentBaseDir?.value) {
      return ''
    }
    return join(currentBaseDir.value, `logs/catalina.out`)
  })
</script>
