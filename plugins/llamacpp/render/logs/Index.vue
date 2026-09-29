<template>
  <div class="module-config">
    <el-card>
      <LogVM ref="log" :log-file="logFile" />
      <template #footer>
        <div class="flex items-center gap-3">
          <div class="min-w-0 flex-1"><ToolVM :log="log" /></div>
          <el-select v-if="files.length" v-model="logFile" class="w-56 shrink-0">
            <el-option
              v-for="file in files"
              :key="file.path"
              :label="file.name"
              :value="file.path"
            />
          </el-select>
        </div>
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onUnmounted, ref, watch } from 'vue'
  import { BrewStore } from '@/store/brew'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { LlamaCppManager } from '../controller'

  const log = ref()
  const logFile = ref('')
  const files = ref<Array<{ name: string; path: string; exists: boolean }>>([])
  const currentVersion = computed(() => BrewStore().currentVersion('llama-cpp'))
  let generation = 0
  watch(
    currentVersion,
    async (version) => {
      const requestGeneration = ++generation
      logFile.value = ''
      files.value = []
      if (!version) return
      const listed = await LlamaCppManager.request<typeof files.value>(
        'listLogFiles',
        JSON.parse(JSON.stringify(version))
      ).catch(() => [])
      if (requestGeneration !== generation) return
      files.value = listed
      logFile.value =
        listed.find((item) => item.name === 'stderr' && item.exists)?.path ??
        listed.find((item) => item.exists)?.path ??
        listed[0]?.path ??
        ''
    },
    { immediate: true }
  )
  onUnmounted(() => {
    generation++
  })
</script>
