<template>
  <div class="module-config">
    <el-card>
      <LogVM ref="log" :log-file="file" />
      <template #footer>
        <ToolVM :log="log" />
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'

  defineProps<{
    file: string
  }>()

  const log = ref()
</script>
