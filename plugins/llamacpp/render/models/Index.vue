<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span>{{ LlamaCppT('models') }}</span>
          <el-radio-group v-model="activeTab" size="small" class="ml-6">
            <el-radio-button value="library">{{ LlamaCppT('modelLibrary') }}</el-radio-button>
            <el-radio-button value="local">{{ LlamaCppT('localModels') }}</el-radio-button>
          </el-radio-group>
        </div>
        <el-button
          v-if="activeTab === 'library'"
          class="button"
          link
          :disabled="searching"
          @click="search(0)"
        >
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': searching }"
          />
        </el-button>
      </div>
    </template>
    <el-scrollbar height="100%" view-class="flex h-full min-h-0 flex-col">
      <div v-if="activeTab === 'library'" class="shrink-0 p-3">
        <div class="flex gap-2">
          <el-input
            v-model="query"
            clearable
            :placeholder="LlamaCppT('searchModels')"
            @keyup.enter="search(0)"
          />
          <el-button :loading="searching" @click="search(0)">{{ LlamaCppT('search') }}</el-button>
        </div>
        <p v-if="!query.trim()" class="mt-2 text-xs opacity-70">{{
          LlamaCppT('popularModelsHint')
        }}</p>
      </div>
      <el-alert v-if="error" class="shrink-0" :title="error" type="error" :closable="false" />
      <div class="min-h-0 flex-1">
        <el-auto-resizer>
          <template #default="{ height, width }">
            <el-table-v2
              class="app-el-table-v2"
              :columns="columns"
              :data="tableData"
              :width="width"
              :height="height"
              :header-height="59"
              :row-height="59"
              row-key="key"
              expand-column-key="name"
              :expanded-row-keys="expandedRowKeys"
              @expanded-rows-change="onExpandedRowsChange"
            >
              <template #empty>
                <div class="flex h-full w-full items-center justify-center p-8">
                  {{
                    searching
                      ? LlamaCppT('loadingModels')
                      : activeTab === 'library'
                        ? LlamaCppT('noModels')
                        : LlamaCppT('noLocalModels')
                  }}
                </div>
              </template>
            </el-table-v2>
          </template>
        </el-auto-resizer>
      </div>
    </el-scrollbar>
    <template v-if="activeTab === 'library' || LlamaCppManager.modelOperation" #footer>
      <div v-if="activeTab === 'library'" class="flex justify-end">
        <el-pagination
          :current-page="page + 1"
          :page-count="page + 1 + (results.length === 20 ? 1 : 0)"
          :disabled="searching"
          layout="prev, pager, next"
          @current-change="(value: number) => search(value - 1)"
        />
      </div>
      <div v-if="LlamaCppManager.modelOperation" class="mt-3 space-y-2">
        <el-alert
          v-if="LlamaCppManager.modelOperation.error"
          :title="LlamaCppManager.modelOperation.error"
          :type="LlamaCppManager.modelOperation.status === 'cancelled' ? 'info' : 'error'"
          :closable="false"
        />
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm"
            >{{ LlamaCppT('downloadStatus') }}: {{ LlamaCppManager.modelOperation.status }}</span
          >
          <span v-if="LlamaCppManager.modelOperation.progress" class="text-sm opacity-70"
            >{{ formatBytes(LlamaCppManager.modelOperation.progress.downloaded ?? 0) }} /
            {{ formatBytes(LlamaCppManager.modelOperation.progress.total ?? 0) }}</span
          >
          <el-button
            v-if="['starting', 'running'].includes(LlamaCppManager.modelOperation.status)"
            size="small"
            @click="LlamaCppManager.cancelModelDownload().catch(() => {})"
            >{{ LlamaCppT('cancel') }}</el-button
          >
        </div>
        <el-progress v-if="modelBusy" :percentage="downloadPercentage" />
      </div>
    </template>
  </el-card>
</template>

<script lang="tsx" setup>
  import { computed, onMounted, onUnmounted, ref } from 'vue'
  import { Download, Delete } from '@element-plus/icons-vue'
  import { ElButton, ElMessageBox, ElTag, ElTooltip, type Column } from 'element-plus'
  import { I18nT } from '@lang/index'
  import { formatBytes } from '@/util/Index'
  import type { HubModel, HubModelFile, LocalModel } from '../../shared/types'
  import { LlamaCppManager } from '../controller'
  import { LlamaCppT } from '../lang'

  type ModelRow = {
    key: string
    name: string
    model?: HubModel
    file?: HubModelFile
    local?: LocalModel
    placeholder?: boolean
    children?: ModelRow[]
  }
  const activeTab = ref<'library' | 'local'>('library')
  const query = ref('')
  const results = ref<HubModel[]>([])
  const files = ref<Record<string, HubModelFile[]>>({})
  const expandedRowKeys = ref<string[]>([])
  const loadingRepos = new Set<string>()
  const searching = ref(false)
  const page = ref(0)
  const error = ref('')
  let generation = 0
  const modelBusy = computed(
    () =>
      !!LlamaCppManager.modelOperation &&
      !['success', 'failed', 'cancelled'].includes(LlamaCppManager.modelOperation.status)
  )
  const downloadPercentage = computed(() => {
    const progress = LlamaCppManager.modelOperation?.progress
    return progress?.total
      ? Math.min(100, Math.round(((progress.downloaded ?? 0) / progress.total) * 100))
      : 0
  })
  const tableData = computed<ModelRow[]>(() =>
    activeTab.value === 'local'
      ? LlamaCppManager.localModels.map((local) => ({
          key: local.localPath,
          name: local.path,
          local
        }))
      : results.value.map((model) => ({
          key: model.id,
          name: model.id,
          model,
          children: files.value[model.id]?.length
            ? files.value[model.id].map((file) => ({
                key: `${model.id}/${file.revision}/${file.path}`,
                name: file.path,
                file
              }))
            : [
                {
                  key: `${model.id}/placeholder`,
                  name: files.value[model.id]
                    ? LlamaCppT('noVariants')
                    : LlamaCppT('loadingVariants'),
                  placeholder: true
                }
              ]
        }))
  )
  const isDownloaded = (file: HubModelFile) =>
    LlamaCppManager.localModels.some(
      (local) =>
        local.repoId === file.repoId && local.revision === file.revision && local.path === file.path
    )
  const download = (file: HubModelFile) => LlamaCppManager.downloadModel(file).catch(() => {})
  const select = (model: LocalModel) =>
    LlamaCppManager.selectModel(model).catch((e) => {
      error.value = `${e}`
    })
  const removeModel = async (model: LocalModel) => {
    try {
      await ElMessageBox.confirm(LlamaCppT('confirmDeleteModel'), LlamaCppT('delete'), {
        type: 'warning'
      })
    } catch {
      return
    }
    try {
      await LlamaCppManager.deleteModel(model)
    } catch (e) {
      error.value = `${e}`
    }
  }
  const search = async (targetPage = 0) => {
    if (searching.value) return
    const requestGeneration = ++generation
    searching.value = true
    error.value = ''
    results.value = []
    files.value = {}
    expandedRowKeys.value = []
    loadingRepos.clear()
    try {
      const listed = await LlamaCppManager.searchHubModels(query.value, targetPage)
      if (requestGeneration !== generation) return
      results.value = listed
      page.value = targetPage
    } catch (e) {
      if (requestGeneration === generation) error.value = `${e}`
    } finally {
      if (requestGeneration === generation) searching.value = false
    }
  }
  const onExpandedRowsChange = (keys: string[]) => {
    expandedRowKeys.value = keys
    for (const key of keys) {
      const model = results.value.find((item) => item.id === key)
      if (!model || files.value[key] || loadingRepos.has(key)) continue
      loadingRepos.add(key)
      const requestGeneration = generation
      LlamaCppManager.getHubModelFiles(model.id)
        .then((listed) => {
          if (requestGeneration === generation)
            files.value[key] = listed.map((file) => ({ ...file, license: model.license }))
        })
        .catch((e) => {
          if (requestGeneration === generation) error.value = `${e}`
        })
        .finally(() => {
          if (requestGeneration === generation) loadingRepos.delete(key)
        })
    }
  }
  const columns = computed<Column<ModelRow>[]>(() => [
    {
      key: 'name',
      title: activeTab.value === 'library' ? LlamaCppT('modelLibrary') : LlamaCppT('localModels'),
      dataKey: 'name',
      class: 'flex-1',
      headerClass: 'flex-1',
      width: 0,
      flexGrow: 1,
      cellRenderer: ({ rowData }) => (
        <ElTooltip
          content={[
            rowData.name,
            rowData.local?.repoId,
            (rowData.local ?? rowData.file ?? rowData.model)?.license
          ]
            .filter(Boolean)
            .join(' · ')}
          show-after={600}
        >
          <div class="min-w-0 px-3">
            <div class="truncate">{rowData.name}</div>
            {(rowData.local?.repoId || rowData.model?.license) && (
              <div class="truncate text-xs opacity-70">
                {rowData.local?.repoId ?? rowData.model?.license}
              </div>
            )}
          </div>
        </ElTooltip>
      )
    },
    {
      key: 'size',
      title: I18nT('common.label.size'),
      width: 140,
      class: 'flex-shrink-0',
      headerClass: 'flex-shrink-0',
      cellRenderer: ({ rowData }) =>
        rowData.file || rowData.local ? (
          <ElTag size="small" effect="plain">
            {formatBytes((rowData.file ?? rowData.local)!.size)}
          </ElTag>
        ) : (
          <span>—</span>
        )
    },
    ...(activeTab.value === 'library'
      ? [
          {
            key: 'downloads',
            title: LlamaCppT('downloads'),
            width: 110,
            class: 'flex-shrink-0',
            headerClass: 'flex-shrink-0',
            cellRenderer: ({ rowData }: { rowData: ModelRow }) => (
              <span>{rowData.model?.downloads.toLocaleString() ?? ''}</span>
            )
          }
        ]
      : []),
    {
      key: 'installed',
      title: I18nT('base.isInstalled'),
      width: 100,
      align: 'center',
      class: 'flex-shrink-0',
      headerClass: 'flex-shrink-0',
      cellRenderer: ({ rowData }) =>
        rowData.local || (rowData.file && isDownloaded(rowData.file)) ? (
          <ElTag type="success" size="small">
            {rowData.local && rowData.local.localPath === LlamaCppManager.selectedModel?.localPath
              ? LlamaCppT('selected')
              : LlamaCppT('downloaded')}
          </ElTag>
        ) : (
          <span />
        )
    },
    {
      key: 'operation',
      title: I18nT('common.label.action'),
      width: 150,
      align: 'center',
      class: 'flex-shrink-0',
      headerClass: 'flex-shrink-0',
      cellRenderer: ({ rowData }) => {
        if (rowData.local) {
          const local = rowData.local
          return (
            <div class="flex items-center gap-2">
              <ElButton
                link
                type="primary"
                disabled={
                  modelBusy.value || local.localPath === LlamaCppManager.selectedModel?.localPath
                }
                onClick={() => select(local)}
              >
                {LlamaCppT('select')}
              </ElButton>
              <ElButton
                link
                type="danger"
                icon={Delete}
                disabled={modelBusy.value}
                onClick={() => removeModel(local)}
              />
            </div>
          )
        }
        const file = rowData.file
        return file ? (
          <ElButton
            link
            type="primary"
            icon={Download}
            disabled={modelBusy.value || isDownloaded(file)}
            onClick={() => download(file)}
          >
            {LlamaCppT('download')}
          </ElButton>
        ) : (
          <span />
        )
      }
    }
  ])
  onMounted(async () => {
    await LlamaCppManager.init()
    await search(0)
  })
  onUnmounted(() => {
    generation++
  })
</script>
