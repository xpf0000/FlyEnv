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
  import { computed, ref, watch } from 'vue'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { BrewStore } from '@/store/brew'
  import { join } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'

  const log = ref()

  const brewStore = BrewStore()
  const currentVersion = computed(() => brewStore.currentVersion('opensearch'))

  const file = ref('')

  const ymlScalar = (content: string, key: string): string => {
    const escaped = key.replace(/\./g, '\\.')
    const match = content.match(new RegExp(`^${escaped}:\\s*(.+?)\\s*$`, 'm'))
    return (match?.[1] ?? '').replace(/^["']|["']$/g, '').trim()
  }

  // Homebrew installs keep config under <path>/libexec/config and usually point
  // path.logs at /opt/homebrew/var/log/opensearch; the main log file name is
  // <cluster.name>.log.
  const resolveLogFile = async () => {
    file.value = ''
    const path = currentVersion.value?.path
    if (!path) return
    const brewConf = join(path, 'libexec', 'config', 'opensearch.yml')
    const isBrew = await fs.existsSync(brewConf).catch(() => false)
    const confFile = isBrew ? brewConf : join(path, 'config', 'opensearch.yml')
    let logsDir = ''
    let clusterName = ''
    try {
      const content = await fs.readFile(confFile)
      logsDir = ymlScalar(content, 'path.logs')
      clusterName = ymlScalar(content, 'cluster.name')
    } catch {}
    const home = isBrew ? join(path, 'libexec') : path
    if (!logsDir) logsDir = join(home, 'logs')
    if (!clusterName) clusterName = 'opensearch'
    file.value = join(logsDir, `${clusterName}.log`)
  }

  watch(
    () => currentVersion.value?.path,
    () => resolveLogFile().catch(),
    { immediate: true }
  )
</script>
