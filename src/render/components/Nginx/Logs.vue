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

  const props = defineProps<{
    type: string
  }>()

  const log = ref()
  const filepath = computed(() => {
    if (window.Server.isWindows) {
      return join(window.Server.NginxDir!, `logs/${props.type}.log`)
    }
    return join(window.Server.NginxDir!, `common/logs/${props.type}.log`)
  })
</script>
