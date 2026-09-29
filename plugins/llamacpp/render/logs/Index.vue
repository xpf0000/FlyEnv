<template>
  <el-card class="version-manager flex h-full flex-col" :body-style="{ flex: '1', minHeight: '0', overflow: 'hidden' }">
    <template #header>
      <div class="card-header"><div class="left"><span>{{ LlamaCppT('logs') }}</span></div></div>
    </template>
    <Log v-if="logFile" :log-file="logFile" class="h-full" />
    <div v-else class="flex h-full items-center justify-center opacity-70">{{ LlamaCppT('noLogs') }}</div>
  </el-card>
</template>

<script lang="ts" setup>
  import { onMounted, ref } from 'vue'
  import { BrewStore } from '@/store/brew'
  import Log from '@/components/Log/index.vue'
  import { LlamaCppManager } from '../controller'
  import { LlamaCppT } from '../lang'

  const logFile = ref('')
  onMounted(async () => {
    await LlamaCppManager.init()
    const installed = BrewStore().module('llama-cpp').installed[0]
    if (!installed) return
    const logs = await LlamaCppManager.request<Array<{ name: string; path: string; exists: boolean }>>('listLogFiles', JSON.parse(JSON.stringify(installed))).catch(() => [])
    logFile.value = logs.find((item) => item.name === 'stderr')?.path ?? logs[0]?.path ?? ''
  })
</script>
