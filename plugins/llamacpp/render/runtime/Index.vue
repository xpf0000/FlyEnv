<template>
  <div class="space-y-3 p-4">
    <div class="flex items-center gap-3">
      <el-radio-group v-model="channel">
        <el-radio-button value="stable">{{ LlamaCppT('stable') }}</el-radio-button>
        <el-radio-button value="prerelease">{{ LlamaCppT('prerelease') }}</el-radio-button>
      </el-radio-group>
      <el-button :loading="loading" @click="load">{{ LlamaCppT('refresh') }}</el-button>
    </div>
    <p v-if="error" class="text-red-500">{{ error }}</p>
    <div v-for="variant in variants" :key="identity(variant)" class="flex items-center justify-between gap-3 rounded border p-3">
      <div>
        <div class="font-semibold">{{ variant.release }} · {{ variant.backend }} <span v-if="variant.cudaVersion">CUDA {{ variant.cudaVersion }}</span></div>
        <div class="text-xs opacity-70">{{ variant.platform }} / {{ variant.arch }} · {{ variant.assetName }} · {{ formatBytes(variant.size) }}</div>
        <div v-if="variant.backend === 'cuda' && !variant.companion" class="text-xs text-amber-600">{{ LlamaCppT('cudaNoCompanion') }}</div>
      </div>
      <el-button :disabled="busy" @click="install(variant)">{{ LlamaCppT('install') }}</el-button>
    </div>
    <div v-if="LlamaCppManager.runtimeOperation" class="rounded border p-3">
      {{ LlamaCppT('runtimeStatus') }}: {{ LlamaCppManager.runtimeOperation.status }}
      <span v-if="LlamaCppManager.runtimeOperation.progress?.asset"> · {{ LlamaCppManager.runtimeOperation.progress.asset }}</span>
      <p v-if="LlamaCppManager.runtimeOperation.error" class="text-red-500">{{ LlamaCppManager.runtimeOperation.error }}</p>
    </div>
    <h3 class="pt-3 font-semibold">{{ LlamaCppT('installedRuntimes') }}</h3>
    <div v-for="runtime in installed" :key="runtime.bin" class="rounded border p-3">
      {{ runtime.version }} · {{ runtime.flag }} · {{ runtime.path }}
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue'
  import { BrewStore } from '@/store/brew'
  import type { RuntimeVariant } from '../../shared/types'
  import { LlamaCppManager } from '../controller'
  import { LlamaCppT } from '../lang'

  const channel = ref<'stable' | 'prerelease'>('stable')
  const variants = ref<RuntimeVariant[]>([])
  const loading = ref(false)
  const error = ref('')
  const installed = computed(() => BrewStore().module('llama-cpp').installed)
  const busy = computed(() => !!LlamaCppManager.runtimeOperation && ['starting','running'].includes(LlamaCppManager.runtimeOperation.status))
  onMounted(() => { LlamaCppManager.init(); load() })
  const load = async () => {
    loading.value = true
    error.value = ''
    try { variants.value = await LlamaCppManager.fetchRuntimeVariants(channel.value) } catch (e) { error.value = `${e}` } finally { loading.value = false }
  }
  const install = async (variant: RuntimeVariant) => {
    error.value = ''
    try {
      await LlamaCppManager.installRuntime(variant)
      await BrewStore().module('llama-cpp').fetchInstalled()
      LlamaCppManager.profile.backend = variant.backend
      await LlamaCppManager.saveProfile()
    } catch (e) { error.value = `${e}` }
  }
  const identity = (variant: RuntimeVariant) => [variant.release, variant.platform, variant.arch, variant.backend, variant.cudaVersion].join('|')
  const formatBytes = (value: number) => `${(value / 1024 / 1024).toFixed(0)} MB`
</script>
