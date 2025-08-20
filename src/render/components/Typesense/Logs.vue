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
  import { ref, computed } from 'vue'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { join } from '@/util/path-browserify'

  const log = ref()

  const filepath = computed(() => {
    return join(window.Server.BaseDir!, `typesense/log/typesense.log`)
  })
  console.log('log filepath: ', filepath.value)
</script>
