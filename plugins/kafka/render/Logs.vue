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
  import { computed, ref, watch } from 'vue'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { BrewStore } from '@/store/brew'
  import { join } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('kafka')
  })

  const log = ref()
  const filepath = ref('')

  const findFile = async () => {
    const v = currentVersion?.value?.version ?? ''
    if (!v) {
      filepath.value = ''
      return
    }
    const baseDir = window.Server.BaseDir!
    const serverLog = join(baseDir, 'kafka', `kafka-${v}`, 'logs', 'server.log')
    const startError = join(baseDir, 'kafka', `kafka-${v}`, `kafka-${v}-start-error.log`)
    const startOut = join(baseDir, 'kafka', `kafka-${v}`, `kafka-${v}-start-out.log`)
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
