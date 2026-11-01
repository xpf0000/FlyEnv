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
    return brewStore.currentVersion('samwaf')
  })

  const log = ref()
  const filepath = ref('')

  const findFile = async () => {
    const v = currentVersion?.value?.version ?? ''
    if (!v) {
      filepath.value = ''
      return
    }
    const logsDir = join(window.Server.AppDir!, 'samwaf', v, 'logs')
    const mainLog = join(logsDir, 'log.log')
    const startError = join(logsDir, 'samwaf-start-error.log')
    const startOut = join(logsDir, 'samwaf-start-out.log')
    if (await fs.existsSync(mainLog)) {
      filepath.value = mainLog
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
