<template>
  <el-card class="version-manager flex h-full flex-col" :body-style="{ flex: '1', minHeight: '0', overflowY: 'auto' }">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span>{{ LlamaCppT('models') }}</span>
          <el-radio-group v-model="activeTab" size="small" class="ml-6">
            <el-radio-button value="library">{{ LlamaCppT('modelLibrary') }}</el-radio-button>
            <el-radio-button value="local">{{ LlamaCppT('localModels') }}</el-radio-button>
          </el-radio-group>
        </div>
        <el-button class="button" link :disabled="searching" @click="refresh">{{ LlamaCppT('refresh') }}</el-button>
      </div>
    </template>

    <template v-if="activeTab === 'library'">
      <div class="mb-3 flex gap-2">
        <el-input v-model="query" clearable :placeholder="LlamaCppT('searchModels')" @keyup.enter="search(0)" />
        <el-button :loading="searching" @click="search(0)">{{ LlamaCppT('search') }}</el-button>
      </div>
      <p v-if="!query.trim()" class="mb-3 text-xs opacity-70">{{ LlamaCppT('popularModelsHint') }}</p>
      <p v-if="error" class="mb-3 text-red-500">{{ error }}</p>

      <div v-if="searching" class="py-5 text-center opacity-70">{{ LlamaCppT('loadingModels') }}</div>
      <el-card v-for="model in results" :key="model.id" class="mb-3 last:mb-0" shadow="never">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="truncate font-semibold">{{ model.id }}</div>
            <div class="text-xs opacity-70">
              {{ LlamaCppT('downloads') }}: {{ model.downloads.toLocaleString() }} · {{ model.license ?? LlamaCppT('licenseUnknown') }}
            </div>
          </div>
          <el-button size="small" :disabled="filesLoading && activeRepoId !== model.id" @click="toggleFiles(model)">
            {{ activeRepoId === model.id ? LlamaCppT('hideVariants') : LlamaCppT('viewVariants') }}
          </el-button>
        </div>

        <div v-if="activeRepoId === model.id" class="mt-3 border-t pt-2">
          <div v-if="filesLoading" class="py-3 text-center text-sm opacity-70">{{ LlamaCppT('loadingVariants') }}</div>
          <div v-else-if="!files.length" class="py-3 text-center text-sm opacity-70">{{ LlamaCppT('noVariants') }}</div>
          <div v-for="file in files" :key="file.path" class="flex items-center justify-between gap-3 border-b py-2 last:border-0">
            <div class="min-w-0">
              <div class="truncate text-sm">{{ file.path }}</div>
              <div class="text-xs opacity-70">{{ formatBytes(file.size) }}</div>
            </div>
            <el-button size="small" :disabled="isDownloaded(file) || modelBusy" @click="download(file)">
              {{ isDownloaded(file) ? LlamaCppT('downloaded') : LlamaCppT('download') }}
            </el-button>
          </div>
        </div>
      </el-card>

      <div v-if="results.length" class="flex items-center justify-center gap-3">
        <el-button :disabled="page === 0 || searching" @click="search(page - 1)">{{ LlamaCppT('previous') }}</el-button>
        <span class="self-center">{{ page + 1 }}</span>
        <el-button :disabled="results.length < 20 || searching" @click="search(page + 1)">{{ LlamaCppT('next') }}</el-button>
      </div>
      <div v-else-if="!searching && !error" class="py-5 text-center opacity-70">{{ LlamaCppT('noModels') }}</div>
    </template>

    <template v-else>
      <p v-if="error" class="mb-3 text-red-500">{{ error }}</p>
      <div v-if="!LlamaCppManager.localModels.length" class="py-5 text-center opacity-70">{{ LlamaCppT('noLocalModels') }}</div>
      <el-card v-for="model in LlamaCppManager.localModels" :key="model.localPath" class="mb-3 last:mb-0" shadow="never">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="truncate">{{ model.path }}</div>
            <div class="truncate text-xs opacity-70">{{ model.repoId }} · {{ formatBytes(model.size) }}</div>
          </div>
          <div class="flex shrink-0 gap-2">
            <el-button size="small" @click="select(model)">{{ model.localPath === LlamaCppManager.selectedModel?.localPath ? LlamaCppT('selected') : LlamaCppT('select') }}</el-button>
            <el-button size="small" type="danger" @click="removeModel(model)">{{ LlamaCppT('delete') }}</el-button>
          </div>
        </div>
      </el-card>
    </template>

    <el-card v-if="LlamaCppManager.modelOperation" class="mt-3" shadow="never">
      <div>{{ LlamaCppT('downloadStatus') }}: {{ LlamaCppManager.modelOperation.status }}</div>
      <div v-if="LlamaCppManager.modelOperation.progress">{{ formatBytes(LlamaCppManager.modelOperation.progress.downloaded ?? 0) }} / {{ formatBytes(LlamaCppManager.modelOperation.progress.total ?? 0) }}</div>
      <p v-if="LlamaCppManager.modelOperation.error" class="text-red-500">{{ LlamaCppManager.modelOperation.error }}</p>
      <el-button v-if="['starting', 'running'].includes(LlamaCppManager.modelOperation.status)" size="small" @click="cancel">{{ LlamaCppT('cancel') }}</el-button>
    </el-card>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue'
  import type { HubModel, HubModelFile, LocalModel } from '../../shared/types'
  import { LlamaCppManager } from '../controller'
  import { LlamaCppT } from '../lang'

  const activeTab = ref<'library' | 'local'>('library')
  const query = ref('')
  const results = ref<HubModel[]>([])
  const files = ref<HubModelFile[]>([])
  const activeRepoId = ref('')
  const searching = ref(false)
  const filesLoading = ref(false)
  const page = ref(0)
  const error = ref('')
  const modelBusy = computed(() => !!LlamaCppManager.modelOperation && !['success', 'failed', 'cancelled'].includes(LlamaCppManager.modelOperation.status))
  let fileRequestId = 0

  onMounted(async () => {
    await LlamaCppManager.init()
    await search(0)
  })

  const refresh = () => activeTab.value === 'library' ? search(0) : LlamaCppManager.init()
  const search = async (targetPage = page.value) => {
    if (searching.value) return
    searching.value = true
    error.value = ''
    fileRequestId++
    activeRepoId.value = ''
    files.value = []
    filesLoading.value = false
    try {
      results.value = await LlamaCppManager.searchHubModels(query.value, targetPage)
      page.value = targetPage
    } catch (e) { error.value = `${e}` } finally { searching.value = false }
  }

  const toggleFiles = async (model: HubModel) => {
    if (activeRepoId.value === model.id) {
      activeRepoId.value = ''
      files.value = []
      fileRequestId++
      filesLoading.value = false
      return
    }
    const requestId = ++fileRequestId
    activeRepoId.value = model.id
    files.value = []
    filesLoading.value = true
    error.value = ''
    try {
      const listed = await LlamaCppManager.getHubModelFiles(model.id)
      if (requestId === fileRequestId) files.value = listed.map((file) => ({ ...file, license: model.license }))
    } catch (e) {
      if (requestId === fileRequestId) error.value = `${e}`
    } finally {
      if (requestId === fileRequestId) filesLoading.value = false
    }
  }

  const isDownloaded = (file: HubModelFile) => LlamaCppManager.localModels.some((model) =>
    model.repoId === file.repoId && model.revision === file.revision && model.path === file.path
  )
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
