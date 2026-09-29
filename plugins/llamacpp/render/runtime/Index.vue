<template>
  <el-card class="version-manager flex h-full flex-col" :body-style="{ flex: '1', minHeight: '0', overflowY: 'auto' }">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span>{{ LlamaCppT('versionManager') }}</span>
          <el-radio-group v-model="channel" size="small" class="ml-6" :disabled="loading">
            <el-radio-button value="stable">{{ LlamaCppT('stable') }}</el-radio-button>
            <el-radio-button value="prerelease">{{ LlamaCppT('prerelease') }}</el-radio-button>
          </el-radio-group>
        </div>
        <el-button class="button" link :disabled="loading" @click="load">{{ LlamaCppT('refresh') }}</el-button>
      </div>
    </template>

    <p v-if="error" class="mb-3 text-red-500">{{ error }}</p>
    <div v-if="loading" class="py-5 text-center opacity-70">{{ LlamaCppT('loadingVersions') }}</div>
    <div v-else-if="!variants.length" class="py-5 text-center opacity-70">{{ LlamaCppT('noRuntimeVariants') }}</div>
    <el-card v-for="variant in variants" :key="identity(variant)" class="mb-3 last:mb-0" shadow="never">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="font-semibold">{{ variant.release }} · {{ variant.backend }} <span v-if="variant.cudaVersion">CUDA {{ variant.cudaVersion }}</span></div>
          <div class="truncate text-xs opacity-70">{{ variant.platform }} / {{ variant.arch }} · {{ variant.assetName }} · {{ formatBytes(variant.size) }}</div>
        </div>
        <el-button :disabled="busy" @click="install(variant)">{{ LlamaCppT('install') }}</el-button>
      </div>
    </el-card>

    <el-card v-if="LlamaCppManager.runtimeOperation" class="mt-3" shadow="never">
      {{ LlamaCppT('runtimeStatus') }}: {{ LlamaCppManager.runtimeOperation.status }}
      <span v-if="LlamaCppManager.runtimeOperation.progress?.asset"> · {{ LlamaCppManager.runtimeOperation.progress.asset }}</span>
      <p v-if="LlamaCppManager.runtimeOperation.error" class="text-red-500">{{ LlamaCppManager.runtimeOperation.error }}</p>
    </el-card>

    <h3 class="pb-2 pt-5 font-semibold">{{ LlamaCppT('installedRuntimes') }}</h3>
    <div v-if="!installed.length" class="py-3 text-sm opacity-70">{{ LlamaCppT('noInstalledRuntimes') }}</div>
    <el-card v-for="runtime in installed" :key="runtime.bin" class="mb-3 last:mb-0" shadow="never">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div>{{ runtime.version }} · {{ runtime.flag }}</div>
          <div class="truncate text-xs opacity-70">{{ runtime.path }}</div>
        </div>
        <el-popconfirm :title="LlamaCppT('confirmRemoveRuntime')" @confirm="remove(runtime.path)">
          <template #reference><el-button type="danger" plain :disabled="busy">{{ LlamaCppT('remove') }}</el-button></template>
        </el-popconfirm>
      </div>
    </el-card>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref, watch } from 'vue'
  import { BrewStore } from '@/store/brew'
  import type { RuntimeVariant } from '../../shared/types'
  import { LlamaCppManager } from '../controller'
  import { LlamaCppT } from '../lang'

  const channel = ref<'stable' | 'prerelease'>('stable')
  const variants = ref<RuntimeVariant[]>([])
  const loading = ref(false)
  const error = ref('')
  const installed = computed(() => BrewStore().module('llama-cpp').installed)
  const busy = computed(() => !!LlamaCppManager.runtimeOperation && ['starting', 'running'].includes(LlamaCppManager.runtimeOperation.status))

  onMounted(() => { LlamaCppManager.init(); load() })
  watch(channel, () => load())
  const load = async () => {
    if (loading.value) return
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
  const remove = async (path: string) => {
    error.value = ''
    try {
      await LlamaCppManager.removeRuntime(path)
      await BrewStore().module('llama-cpp').fetchInstalled()
    } catch (e) { error.value = `${e}` }
  }
  const identity = (variant: RuntimeVariant) => [variant.release, variant.platform, variant.arch, variant.backend, variant.cudaVersion].join('|')
  const formatBytes = (value: number) => `${(value / 1024 / 1024).toFixed(0)} MB`
</script>
