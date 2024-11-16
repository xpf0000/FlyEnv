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
  import IPC from '@/util/IPC'

  const log = ref()
  const filepath = ref('')

  IPC.send('app-fork:mailpit', 'fetchLogPath').then((key: string, res: any) => {
    IPC.off(key)
    filepath.value = res?.data ?? ''
  })
</script>
