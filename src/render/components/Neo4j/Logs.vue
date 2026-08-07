<template>
  <div class="module-config">
    <el-card>
      <template #header>
        <el-radio-group v-model="logType">
          <el-radio-button
            v-for="item in files"
            :key="item.path"
            :label="item.name"
            :value="item.path"
          />
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
  import { BrewStore } from '@/store/brew'
  import IPC from '@/util/IPC'
  import { join } from '@/util/path-browserify'
  import { Neo4jManager } from './store'

  const brewStore = BrewStore()
  const log = ref()
  const logType = ref('')
  const currentVersion = computed(() => brewStore.currentVersion('neo4j'))
  const dynamicFiles = ref<Array<{ name: string; path: string }>>([])

  const invoke = (...args: any[]) =>
    new Promise<any>((resolve) => {
      IPC.send('app-fork:neo4j', ...args).then((key: string, res: any) => {
        if (res?.code === 200) return
        IPC.off(key)
        resolve(res)
      })
    })

  const files = computed(() => {
    const item = currentVersion.value
    if (dynamicFiles.value.length) return dynamicFiles.value
    if (!item) return []
    const instanceDir = Neo4jManager.instanceDirFor(item)
    const logDir = join(instanceDir, 'logs')
    return [
      { name: 'neo4j', path: join(logDir, 'neo4j.log') },
      { name: 'debug', path: join(logDir, 'debug.log') },
      { name: 'start-out', path: join(logDir, 'start-out.log') },
      { name: 'start-error', path: join(logDir, 'start-error.log') }
    ]
  })

  watch(
    currentVersion,
    async (item) => {
      dynamicFiles.value = []
      if (!item?.version) return
      const result = await invoke('getLogFiles', JSON.parse(JSON.stringify(item)))
      if (result?.code === 0 && Array.isArray(result?.data)) dynamicFiles.value = result.data
    },
    { immediate: true }
  )

  watch(
    files,
    (list) => {
      if (!logType.value || !list.some((item) => item.path === logType.value)) {
        logType.value = list[0]?.path ?? ''
      }
    },
    { immediate: true }
  )
</script>
