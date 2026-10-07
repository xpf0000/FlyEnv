<template>
  <Manager
    type-flag="llama-cpp"
    title="llama.cpp"
    :items="items"
    :fetching="loading"
    :has-static="true"
    :show-brew-lib="false"
    :show-port-lib="false"
    @refresh="load(true)"
    @action="handleVersion"
  >
    <template #header-left>
      <span>llama.cpp</span>
      <el-radio-group v-model="channel" size="small" class="ml-6" :disabled="loading">
        <el-radio-button value="stable">{{ LlamaCppT('stable') }}</el-radio-button>
        <el-radio-button value="prerelease">{{ LlamaCppT('prerelease') }}</el-radio-button>
      </el-radio-group>
    </template>
  </Manager>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref, watch } from 'vue'
  import { ElMessageBox } from 'element-plus'
  import { MessageError } from '@/util/Element'
  import Manager from '@/components/VersionManager/index.vue'
  import type { StaticVersionItem } from '@/components/VersionManager/static/setup'
  import { BrewStore } from '@/store/brew'
  import { formatBytes } from '@/util/Index'
  import type { RuntimeVariant } from '../../shared/types'
  import { runtimeDirectoryName } from '../../shared/runtime'
  import { LlamaCppManager } from '../controller'
  import { LlamaCppT } from '../lang'
  import { escapeNoticeText } from '../notice'

  type RuntimeRow = StaticVersionItem & { variant?: RuntimeVariant; installedPath?: string }
  const channel = ref<'stable' | 'prerelease'>('stable')
  const variants = ref<RuntimeVariant[]>([])
  const loading = ref(false)
  const module = BrewStore().module('llama-cpp')
  const items = computed<RuntimeRow[]>(() => {
    const seen = new Set<string>()
    const rows = variants.value.map((variant) => {
      const installed = module.installed.find(
        (runtime) =>
          runtime.path.replace(/\\/g, '/').split('/').pop() === runtimeDirectoryName(variant)
      )
      if (installed) seen.add(installed.path)
      const operation = LlamaCppManager.getRuntimeOperation(variant)
      const busy = !!operation && ['starting', 'running'].includes(operation.status)
      const progress = operation?.progress
      return {
        name: `llama.cpp · ${variant.backend}${variant.cudaVersion ? ` ${variant.cudaVersion}` : ''} · ${formatBytes(variant.size)}`,
        url: variant.assetUrl,
        version: variant.release,
        installed: !!installed,
        installedPath: installed?.path,
        variant,
        disabled: busy,
        downing: busy,
        progress: progress?.total
          ? Math.round(((progress.downloaded ?? 0) / progress.total) * 100)
          : 0
      }
    })
    return [
      ...rows,
      ...module.installed
        .filter((runtime) => !seen.has(runtime.path))
        .map((runtime) => {
          const operation = LlamaCppManager.getRuntimeOperation(runtime.path)
          const busy = !!operation && ['starting', 'running'].includes(operation.status)
          return {
            name: `llama.cpp · ${runtime.flag ?? ''}`,
            url: runtime.path,
            version: runtime.version ?? '',
            installed: true,
            installedPath: runtime.path,
            disabled: busy,
            downing: busy
          }
        })
    ]
  })
  const load = async (refresh = false) => {
    if (loading.value) return
    loading.value = true
    try {
      variants.value = await LlamaCppManager.fetchRuntimeVariants(channel.value, refresh)
    } catch (e) {
      MessageError(escapeNoticeText(e))
    } finally {
      loading.value = false
    }
  }
  const handleVersion = async (item: StaticVersionItem) => {
    const row = item as RuntimeRow
    if (row.downing) return
    if (row.installedPath) {
      try {
        await ElMessageBox.confirm(LlamaCppT('confirmRemoveRuntime'), LlamaCppT('remove'), {
          type: 'warning'
        })
      } catch {
        return
      }
    }
    try {
      if (row.installedPath) await LlamaCppManager.removeRuntime(row.installedPath)
      else if (row.variant) await LlamaCppManager.installRuntime(row.variant)
    } catch {
      // The controller owns runtime terminal errors and notices.
    }
  }
  watch(channel, () => load())
  onMounted(async () => {
    await LlamaCppManager.init()
    await module.fetchInstalled()
    await load()
  })
</script>
