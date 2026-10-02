<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span>{{ LlamaCppT('models') }}</span>
          <el-radio-group v-model="activeTab" size="small" class="ml-6">
            <el-radio-button value="local">{{ LlamaCppT('localModels') }}</el-radio-button>
            <el-radio-button value="library">{{ LlamaCppT('modelLibrary') }}</el-radio-button>
          </el-radio-group>
        </div>
        <el-button
          v-if="activeTab === 'library'"
          class="button"
          link
          :disabled="searching"
          @click="search(page, true)"
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
              :default-expanded-row-keys="expandedRowKeys"
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
    <template v-if="activeTab === 'library'" #footer>
      <div class="flex justify-start">
        <el-pagination
          :current-page="page + 1"
          :page-count="page + 1 + (results.length === 20 ? 1 : 0)"
          :disabled="searching"
          layout="prev, pager, next"
          @current-change="(value: number) => search(value - 1)"
        />
      </div>
    </template>
  </el-card>
</template>

<script lang="tsx" setup>
  import { computed, onMounted, onUnmounted, reactive, toRefs } from 'vue'
  import { Download, Delete, Close } from '@element-plus/icons-vue'
  import { ElButton, ElMessageBox, ElProgress, ElTag, ElTooltip, type Column } from 'element-plus'
  import { I18nT } from '@lang/index'
  import { formatBytes } from '@/util/Index'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import {
    getModelSizeColorForHardware,
    modelHardwareFromReport,
    type ModelHardware
  } from '@/util/ModelSize'
  import IPC from '@/util/IPC'
  import type { HubModel, HubModelFile, LocalModel } from '../../shared/types'
  import { isGGUFShardPath, isStandaloneGGUFPath } from '../../shared/modelFile'
  import { LlamaCppManager, modelFileKey } from '../controller'
  import { LlamaCppT } from '../lang'
  import { escapeNoticeText } from '../notice'

  type ModelRow = {
    key: string
    name: string
    model?: HubModel
    file?: HubModelFile
    local?: LocalModel
    placeholder?: boolean
    downloading?: boolean
    progress?: number
    children?: ModelRow[]
  }
  const isMainModelRow = (row: ModelRow) => {
    if (row.local) return !isGGUFShardPath(row.local.path) && (row.local.standalone ?? isStandaloneGGUFPath(row.local.path, row.local.repoId))
    return !!row.file && isStandaloneGGUFPath(row.file.path, row.file.repoId)
  }
  const { activeTab, query, results, files, expandedRowKeys, searching, page } = toRefs(LlamaCppManager.modelView)
  const hardware = reactive<ModelHardware>({ ramGB: 0, vramGB: 0, loaded: false })
  let hardwareRequestKey = ''
  let mounted = true
  const modelBusy = computed(
    () =>
      !!LlamaCppManager.modelOperation &&
      !['success', 'failed', 'cancelled'].includes(LlamaCppManager.modelOperation.status)
  )
  const downloadPercentage = () => {
    const progress = LlamaCppManager.modelOperation?.progress
    return progress?.total
      ? Math.min(100, Math.round(((progress.downloaded ?? 0) / progress.total) * 100))
      : 0
  }
  const tableData = computed<ModelRow[]>(() => {
    const downloading = modelBusy.value
    const targetKey = LlamaCppManager.modelOperation?.targetKey
    const targetFile = LlamaCppManager.modelOperation?.targetFile
    const progress = downloading ? downloadPercentage() : 0
    if (activeTab.value === 'local')
      return LlamaCppManager.localModels.map((local) => ({
        key: local.localPath,
        name: local.path,
        local
      }))
    const rows: ModelRow[] = results.value.map((model) => ({
      key: model.id,
      name: model.id,
      model,
      children: files.value[model.id]?.length
        ? files.value[model.id].map((file) => ({
            key: `${model.id}/${file.revision}/${file.path}`,
            name: file.path,
            file,
            downloading: downloading && targetKey === modelFileKey(file),
            progress
          }))
        : [
            {
              key: `${model.id}/placeholder`,
              name: files.value[model.id] ? LlamaCppT('noVariants') : LlamaCppT('loadingVariants'),
              placeholder: true
            }
          ]
    }))
    const targetVisible = rows.some(
      (row) =>
        expandedRowKeys.value.includes(row.key) &&
        row.children?.some((child) => child.file && modelFileKey(child.file) === targetKey)
    )
    if (downloading && targetFile && !targetVisible)
      rows.unshift({
        key: `active-download:${targetKey}`,
        name: `${targetFile.repoId}/${targetFile.path}`,
        file: targetFile,
        downloading: true,
        progress
      })
    return rows
  })
  const downloadedModel = (file: HubModelFile) =>
    LlamaCppManager.localModels.find(
      (local) =>
        local.repoId === file.repoId && local.revision === file.revision && local.path === file.path
    )
  const showError = (error: unknown) => MessageError(escapeNoticeText(error))
  const download = async (file: HubModelFile) => {
    try {
      await LlamaCppManager.downloadModel(file)
      MessageSuccess(I18nT('base.success'))
    } catch (e) {
      if (LlamaCppManager.modelOperation?.status !== 'cancelled') showError(e)
    }
  }
  const cancelDownload = () => LlamaCppManager.cancelModelDownload().catch(showError)
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
      MessageSuccess(I18nT('base.success'))
    } catch (e) {
      showError(e)
    }
  }
  const search = async (targetPage = 0, refresh = false) => {
    try {
      await LlamaCppManager.searchModelLibrary(targetPage, refresh)
    } catch (e) {
      if (mounted) showError(e)
    }
  }
  const onExpandedRowsChange = (keys: string[]) => {
    LlamaCppManager.setExpandedModelRepos(keys).catch((error) => {
      if (mounted) showError(error)
    })
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
      key: 'mainModel',
      title: LlamaCppT('isMainModel'),
      width: 160,
      align: 'center',
      class: 'flex-shrink-0',
      headerClass: 'flex-shrink-0',
      cellRenderer: ({ rowData }) =>
        rowData.file || rowData.local ? (
          <ElTag size="small" effect="plain" type={isMainModelRow(rowData) ? 'success' : 'info'}>
            {LlamaCppT(isMainModelRow(rowData) ? 'mainModel' : 'supportingFile')}
          </ElTag>
        ) : (
          <span />
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
          <ElTag
            size="small"
            effect="plain"
            type={isMainModelRow(rowData)
              ? getModelSizeColorForHardware(
                  (rowData.file ?? rowData.local)!.size / 1024 ** 3,
                  hardware
                )
              : 'info'}
          >
            {formatBytes((rowData.file ?? rowData.local)!.size)}
          </ElTag>
        ) : (
          <span>—</span>
        )
    },
    ...(activeTab.value === 'library'
      ? [
          {
            key: 'progress',
            title: LlamaCppT('downloadStatus'),
            width: 150,
            class: 'flex-shrink-0',
            headerClass: 'flex-shrink-0',
            cellRenderer: ({ rowData }: { rowData: ModelRow }) =>
              rowData.downloading ? (
                <div class="cell-progress w-full">
                  <ElProgress class="w-full" percentage={rowData.progress ?? 0} />
                </div>
              ) : (
                <span />
              )
          }
        ]
      : []),
    ...(activeTab.value === 'library'
      ? [
          {
            key: 'installed',
            title: I18nT('base.isInstalled'),
            width: 100,
            align: 'center' as const,
            class: 'flex-shrink-0',
            headerClass: 'flex-shrink-0',
            cellRenderer: ({ rowData }: { rowData: ModelRow }) =>
              rowData.file && downloadedModel(rowData.file) ? (
                <YbIcon class="installed" svg={import('@/svg/ok.svg?raw')}></YbIcon>
              ) : (
                <span />
              )
          }
        ]
      : []),
    {
      key: 'operation',
      title: I18nT('common.label.action'),
      width: 100,
      align: 'center',
      class: 'flex-shrink-0',
      headerClass: 'flex-shrink-0',
      cellRenderer: ({ rowData }) => {
        if (rowData.local) {
          const local = rowData.local
          return (
            <ElButton
              link
              type="danger"
              icon={Delete}
              aria-label={LlamaCppT('delete')}
              disabled={modelBusy.value}
              onClick={() => removeModel(local)}
            />
          )
        }
        const file = rowData.file
        if (!file) return <span />
        if (rowData.downloading)
          return (
            <ElButton
              link
              icon={Close}
              aria-label={LlamaCppT('cancel')}
              disabled={LlamaCppManager.modelOperation?.status === 'cancelling'}
              onClick={cancelDownload}
            />
          )
        const local = downloadedModel(file)
        return (
          <ElButton
            link
            type={local ? 'danger' : 'primary'}
            icon={local ? Delete : Download}
            aria-label={local ? LlamaCppT('delete') : LlamaCppT('download')}
            disabled={modelBusy.value}
            onClick={() => (local ? removeModel(local) : download(file))}
          />
        )
      }
    }
  ])
  onMounted(async () => {
    const request = IPC.send('app-fork:ollama', 'pcReport')
    hardwareRequestKey = request.key
    request.then((key: string, response: { code?: number; data?: Record<string, unknown> }) => {
      IPC.off(key)
      if (mounted && response?.code === 0 && response.data)
        Object.assign(hardware, modelHardwareFromReport(response.data))
    })
    await LlamaCppManager.init()
    if (mounted) await LlamaCppManager.ensureModelLibrary().catch((error) => {
      if (mounted) showError(error)
    })
  })
  onUnmounted(() => {
    mounted = false
    if (hardwareRequestKey) IPC.off(hardwareRequestKey)
  })
</script>
