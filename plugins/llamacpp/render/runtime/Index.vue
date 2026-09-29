<template>
  <Manager
    type-flag="llama-cpp"
    title="llama.cpp"
    :items="items"
    :fetching="loading"
    :has-static="true"
    :show-brew-lib="false"
    :show-port-lib="false"
    @refresh="load"
    @action="handleVersion"
  >
    <template #header-left>
      <span>llama.cpp</span>
      <el-radio-group v-model="channel" size="small" class="ml-6" :disabled="loading">
        <el-radio-button value="stable">{{ LlamaCppT('stable') }}</el-radio-button>
        <el-radio-button value="prerelease">{{ LlamaCppT('prerelease') }}</el-radio-button>
      </el-radio-group>
    </template>
    <template v-if="error || LlamaCppManager.runtimeOperation" #footer>
      <el-alert
        v-if="error || LlamaCppManager.runtimeOperation?.error"
        :title="error || LlamaCppManager.runtimeOperation?.error"
        type="error"
        :closable="false"
      />
      <div v-else class="flex items-center gap-3">
        <span
          >{{ LlamaCppT('runtimeStatus') }}: {{ LlamaCppManager.runtimeOperation?.status }}</span
        >
        <span class="truncate text-sm opacity-70">{{
          LlamaCppManager.runtimeOperation?.progress?.asset
        }}</span>
      </div>
    </template>
  </Manager>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref, watch } from 'vue'
  import { ElMessageBox } from 'element-plus'
  import Manager from '@/components/VersionManager/index.vue'
  import type { StaticVersionItem } from '@/components/VersionManager/static/setup'
  import { BrewStore } from '@/store/brew'
  import { formatBytes } from '@/util/Index'
  import type { RuntimeVariant } from '../../shared/types'
  import { runtimeDirectoryName, runtimeIdentityKey } from '../../shared/runtime'
  import { LlamaCppManager } from '../controller'
  import { LlamaCppT } from '../lang'

  type RuntimeRow = StaticVersionItem & { variant?: RuntimeVariant; installedPath?: string }
  const channel = ref<'stable' | 'prerelease'>('stable')
  const variants = ref<RuntimeVariant[]>([])
  const loading = ref(false)
  const error = ref('')
  const module = BrewStore().module('llama-cpp')
  const busy = computed(
    () =>
      !!LlamaCppManager.runtimeOperation &&
      ['starting', 'running'].includes(LlamaCppManager.runtimeOperation.status)
  )
  const items = computed<RuntimeRow[]>(() => {
    const seen = new Set<string>()
    const rows = variants.value.map((variant) => {
      const installed = module.installed.find(
        (runtime) =>
          runtime.path.replace(/\\/g, '/').split('/').pop() === runtimeDirectoryName(variant)
      )
      if (installed) seen.add(installed.path)
      const operation = LlamaCppManager.runtimeOperation
      const progress = operation?.progress
      return {
        name: `llama.cpp · ${variant.backend}${variant.cudaVersion ? ` ${variant.cudaVersion}` : ''} · ${formatBytes(variant.size)}`,
        url: variant.assetUrl,
        version: variant.release,
        installed: !!installed,
        installedPath: installed?.path,
        variant,
        disabled: busy.value,
        downing:
          busy.value &&
          (operation?.id === runtimeIdentityKey(variant) || operation?.id === installed?.path),
        progress: progress?.total
          ? Math.round(((progress.downloaded ?? 0) / progress.total) * 100)
          : 0
      }
    })
    return [
      ...rows,
      ...module.installed
        .filter((runtime) => !seen.has(runtime.path))
        .map((runtime) => ({
          name: `llama.cpp · ${runtime.flag ?? ''}`,
          url: runtime.path,
          version: runtime.version ?? '',
          installed: true,
          installedPath: runtime.path,
          disabled: busy.value,
          downing: busy.value && LlamaCppManager.runtimeOperation?.id === runtime.path
        }))
    ]
  })
  const load = async () => {
    if (loading.value) return
    loading.value = true
    error.value = ''
    try {
      variants.value = await LlamaCppManager.fetchRuntimeVariants(channel.value)
    } catch (e) {
      error.value = `${e}`
    } finally {
      loading.value = false
    }
  }
  const handleVersion = async (item: StaticVersionItem) => {
    const row = item as RuntimeRow
    if (busy.value) return
    if (row.installedPath) {
      try {
        await ElMessageBox.confirm(LlamaCppT('confirmRemoveRuntime'), LlamaCppT('remove'), {
          type: 'warning'
        })
      } catch {
        return
      }
    }
    error.value = ''
    try {
      if (row.installedPath) await LlamaCppManager.removeRuntime(row.installedPath)
      else if (row.variant) await LlamaCppManager.installRuntime(row.variant)
      await module.fetchInstalled(true)
    } catch (e) {
      error.value = `${e}`
    }
  }
  watch(channel, load)
  onMounted(async () => {
    await LlamaCppManager.init()
    await module.fetchInstalled()
    await load()
  })
</script>
