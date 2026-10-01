<template>
  <div class="module-config">
    <el-card>
      <template #header>
        <el-radio-group v-model="logFile">
          <el-radio-button
            v-for="file in files"
            :key="file.path"
            :label="file.name"
            :value="file.path"
          />
        </el-radio-group>
      </template>
      <LogVM ref="log" :log-file="logFile" class="h-full overflow-hidden" />
      <template #footer>
        <ToolVM :log="log" />
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
