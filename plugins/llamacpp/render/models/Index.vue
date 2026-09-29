<template>
  <div class="space-y-4 p-4">
    <div class="flex gap-2">
      <el-input v-model="query" :placeholder="LlamaCppT('searchModels')" @keyup.enter="search" />
      <el-button :loading="searching" @click="search(0)">{{ LlamaCppT('search') }}</el-button>
    </div>
    <p v-if="error" class="text-red-500">{{ error }}</p>
    <div v-for="model in results" :key="model.id" class="rounded border p-3">
      <div class="font-semibold">{{ model.id }}</div>
      <div class="text-xs opacity-70">{{ LlamaCppT('downloads') }}: {{ model.downloads }} · {{ model.license ?? LlamaCppT('licenseUnknown') }}</div>
      <el-button size="small" class="mt-2" @click="inspect(model.id)">{{ LlamaCppT('chooseFile') }}</el-button>
    </div>
    <div v-if="results.length" class="flex gap-2">
      <el-button :disabled="page === 0" @click="search(page - 1)">{{ LlamaCppT('previous') }}</el-button>
      <span class="self-center">{{ page + 1 }}</span>
      <el-button :disabled="results.length < 20" @click="search(page + 1)">{{ LlamaCppT('next') }}</el-button>
    </div>
    <div v-if="files.length" class="rounded border p-3">
      <div v-for="file in files" :key="file.path" class="flex items-center justify-between gap-3 py-2">
        <span>{{ file.path }} ({{ formatBytes(file.size) }})</span>
        <el-button size="small" :disabled="!!LlamaCppManager.modelOperation && !['success','failed','cancelled'].includes(LlamaCppManager.modelOperation.status)" @click="download(file)">{{ LlamaCppT('download') }}</el-button>
      </div>
    </div>
    <div v-if="LlamaCppManager.modelOperation" class="rounded border p-3">
      <div>{{ LlamaCppT('downloadStatus') }}: {{ LlamaCppManager.modelOperation.status }}</div>
      <div v-if="LlamaCppManager.modelOperation.progress">{{ formatBytes(LlamaCppManager.modelOperation.progress.downloaded ?? 0) }} / {{ formatBytes(LlamaCppManager.modelOperation.progress.total ?? 0) }}</div>
      <el-button v-if="['starting','running'].includes(LlamaCppManager.modelOperation.status)" size="small" @click="cancel">{{ LlamaCppT('cancel') }}</el-button>
    </div>
    <h3 class="pt-2 font-semibold">{{ LlamaCppT('localModels') }}</h3>
    <div v-for="model in LlamaCppManager.localModels" :key="model.localPath" class="flex items-center justify-between gap-3 rounded border p-3">
      <div><div>{{ model.path }}</div><div class="text-xs opacity-70">{{ model.repoId }} · {{ formatBytes(model.size) }}</div></div>
      <div class="flex gap-2">
        <el-button size="small" @click="select(model)">{{ model.localPath === LlamaCppManager.selectedModel?.localPath ? LlamaCppT('selected') : LlamaCppT('select') }}</el-button>
        <el-button size="small" type="danger" @click="removeModel(model)">{{ LlamaCppT('delete') }}</el-button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted, ref } from 'vue'
  import type { HubModel, HubModelFile, LocalModel } from '../../shared/types'
  import { LlamaCppManager } from '../controller'
  import { LlamaCppT } from '../lang'

  const query = ref('')
  const results = ref<HubModel[]>([])
  const files = ref<HubModelFile[]>([])
  const searching = ref(false)
  const page = ref(0)
  const error = ref('')
  onMounted(() => LlamaCppManager.init())
  const search = async (targetPage = page.value) => {
    searching.value = true
    error.value = ''
    try { results.value = await LlamaCppManager.searchHubModels(query.value, targetPage); page.value = targetPage } catch (e) { error.value = `${e}` } finally { searching.value = false }
  }
  const inspect = async (repoId: string) => {
    error.value = ''
    try { files.value = await LlamaCppManager.getHubModelFiles(repoId) } catch (e) { error.value = `${e}` }
  }
  const download = async (file: HubModelFile) => {
    error.value = ''
    try { await LlamaCppManager.downloadModel(file) } catch (e) { error.value = `${e}` }
  }
  const cancel = () => LlamaCppManager.cancelModelDownload().catch((e) => { error.value = `${e}` })
  const select = (model: LocalModel) => LlamaCppManager.selectModel(model).catch((e) => { error.value = `${e}` })
  const removeModel = async (model: LocalModel) => {
    if (!window.confirm(LlamaCppT('confirmDeleteModel'))) return
    try { await LlamaCppManager.deleteModel(model) } catch (e) { error.value = `${e}` }
  }
  const formatBytes = (value: number) => {
    if (!value) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
    return `${(value / 1024 ** index).toFixed(1)} ${units[index]}`
  }
</script>
