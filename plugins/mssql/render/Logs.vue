<template>
  <div class="module-config">
    <el-card>
      <WindowsLogVM v-if="isWindows" ref="log" :log-file="filepath" :version="currentVersion" />
      <LogVM v-else ref="log" :log-file="filepath" />
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
  import WindowsLogVM from './log/index.vue'
  import { BrewStore } from '@/store/brew'
  import { join } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'

  const isWindows = window.Server.isWindows
  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('mssql')
  })

  const log = ref()
  const filepath = ref('')

  const findFile = async () => {
    const v = currentVersion?.value?.version ?? ''
    if (!v) {
      filepath.value = ''
      return
    }
    if (window.Server.isWindows) {
      const runtime = (currentVersion.value as any)?.mssqlRuntime
      filepath.value =
        runtime?.errorLogFile ||
        (runtime?.sqlDataRoot ? join(runtime.sqlDataRoot, 'Log', 'ERRORLOG') : '')
      return
    }
    const baseDir = window.Server.BaseDir!
    const major = v.split('.')[0]
    const serverLog = join(baseDir, 'mssql', `data-${major}`, 'log', 'errorlog')
    const startError = join(baseDir, 'mssql', `mssql-${v}-start-error.log`)
    const startOut = join(baseDir, 'mssql', `mssql-${v}-start-out.log`)
    if (await fs.existsSync(serverLog)) {
      filepath.value = serverLog
    } else if (await fs.existsSync(startError)) {
      filepath.value = startError
    } else {
      filepath.value = startOut
    }
  }

  watch(
    currentVersion,
    (v) => {
      filepath.value = ''
      if (v) {
        findFile().then().catch()
      }
    },
    {
      immediate: true
    }
  )
</script>
