<template>
  <div class="module-config">
    <el-card>
      <LogVM ref="log" :log-file="logFile" />
      <template #footer>
        <ToolVM :log="log" />
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { ref, onMounted } from 'vue'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import IPC from '@/util/IPC'

  const log = ref()
  const logFile = ref('')

  onMounted(() => {
    IPC.send('mcp:getAuditLogFile').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0 && res?.data) {
        logFile.value = res.data
      }
    })
  })
</script>
