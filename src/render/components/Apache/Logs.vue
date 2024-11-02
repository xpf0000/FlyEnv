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

  const props = defineProps<{
    type: string
  }>()

  const appStore = AppStore()
  const version = computed(() => {
    return appStore.config.server?.apache?.current
  })

  const log = ref()
  const filepath = computed(() => {
    if (!version?.value || !version?.value?.bin) {
      return ''
    }
    return join(global.Server.ApacheDir, `${version.value.version}.${props.type}.log`)
  })
</script>
