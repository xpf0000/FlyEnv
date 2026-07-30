<template>
  <div class="module-config">
    <el-card>
      <template #header>
        <el-radio-group v-model="logType">
          <el-radio-button
            v-for="f in files"
            :key="f.path"
            :label="f.name"
            :value="f.path"
          ></el-radio-button>
        </el-radio-group>
      </template>
      <LogVM ref="log" :key="logType" :log-file="logType" />
      <template #footer>
        <ToolVM :log="log" />
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { join } from '@/util/path-browserify'

  const log = ref()

  const files = computed(() => {
    const dir = window.Server.ClickHouseDir
    if (!dir) {
      return []
    }
    const logDir = join(dir, 'log')
    return [
      { name: 'server', path: join(logDir, 'server.log') },
      { name: 'error', path: join(logDir, 'server.err.log') },
      { name: 'start-out', path: join(logDir, 'server.start.out.log') },
      { name: 'start-error', path: join(logDir, 'server.start.err.log') },
      { name: 'ch-ui-start-out', path: join(dir, 'ch-ui/log/ch-ui.start.out.log') },
      { name: 'ch-ui-start-error', path: join(dir, 'ch-ui/log/ch-ui.start.err.log') }
    ]
  })

  const logType = ref('')

  watch(
    files,
    (list) => {
      if (!logType.value || !list.some((f) => f.path === logType.value)) {
        logType.value = list?.[0]?.path ?? ''
      }
    },
    { immediate: true }
  )
</script>
