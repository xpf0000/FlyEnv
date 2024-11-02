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
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'

  const { join } = require('path')

  const props = defineProps<{
    type: string
  }>()

  const log = ref()
  const filepath = ref(join(global.Server.MariaDBDir, `${props.type}.log`))
</script>
