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
  import { ref } from 'vue'
  import LogVM from '@web/components/Log/index.vue'
  import ToolVM from '@web/components/Log/tool.vue'

  defineProps<{
    type: string
  }>()

  const log = ref()
  const filepath = ref('')
  import('@web/config/nginx.log.txt?raw').then((res) => {
    filepath.value = res.default
  })
</script>
