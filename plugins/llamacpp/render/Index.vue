<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group :model-value="tab" class="mt-3" @change="changeTab">
      <el-radio-button v-for="(item, index) in tabs" :key="index" :label="item" :value="index" />
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="llama-cpp" title="llama.cpp">
        <template #tool-left>
          <div class="ml-4 flex min-w-0 items-center gap-3">
            <el-tag v-if="launchSummary.pending" type="warning">{{
              LlamaCppT('savedPending')
            }}</el-tag>
            <el-tooltip :content="launchSummary.detail"
              ><el-tag :type="launchSummary.unknown ? 'info' : 'success'">{{
                launchSummary.text
              }}</el-tag></el-tooltip
            >
            <el-button link @click="openSettings(LlamaCppManager.selectedModel)">{{
              LlamaCppT('configure')
            }}</el-button>
            <el-popover placement="bottom" width="480" trigger="click">
              <template #reference>
                <el-button link class="min-w-0 w-full">
                  <span class="block min-w-0 truncate text-yellow-500"
                    >{{ LlamaCppT('selectedModel') }}:
                    {{ LlamaCppManager.selectedModel?.path ?? LlamaCppT('none') }}</span
                  >
                </el-button>
              </template>
              <el-descriptions :column="1" border>
                <el-descriptions-item :label="LlamaCppT('selectedModel')">
                  <el-select
                    :model-value="LlamaCppManager.selectedModel?.localPath"
                    class="w-full"
                    filterable
                    :loading="modelSwitchBusy"
                    :disabled="modelSwitchBusy || currentVersion?.running"
                    :placeholder="LlamaCppT('none')"
                    @change="selectModel"
                  >
                    <el-option
                      v-for="model in selectableModels"
                      :key="model.localPath"
                      :label="model.path"
                      :value="model.localPath"
                    />
                  </el-select>
                </el-descriptions-item>
                <el-descriptions-item :label="LlamaCppT('endpoint')">{{
                  endpoint
                }}</el-descriptions-item>
                <el-descriptions-item
                  v-if="endpoint !== savedEndpoint"
                  :label="LlamaCppT('nextConfiguration')"
                  >{{ savedEndpoint }}</el-descriptions-item
                >
              </el-descriptions>
              <el-button class="mt-3" size="small" @click="copyEndpoint">{{
                LlamaCppT('copyEndpoint')
              }}</el-button>
            </el-popover>
          </div>
        </template>
      </Service>
      <RuntimeView v-else-if="tab === 1" />
      <ModelsView v-else-if="tab === 2" @configure="openSettings" @associate="associate" />

      <LogsView v-else-if="tab === 4" />
      <SettingsView
        v-show="tab === 3"
        ref="settingsView"
        :initial-model-key="editingModelKey"
        :initial-projector-key="editingProjectorKey"
        @open-repository="openRepository"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '@/components/ServiceManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { LlamaCppT } from './lang'
  import { LlamaCppManager } from './controller'
  import { isGGUFShardPath, isStandaloneGGUFPath } from '../shared/modelFile'
  import ModelsView from './models/Index.vue'
  import RuntimeView from './runtime/Index.vue'
  import SettingsView from './settings/Index.vue'
  import LogsView from './logs/Index.vue'
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
  import router from '@/router/index'
  import { launchConfigKey } from '../shared/settings'
  import { modelFileKey } from '../shared/modelFile'
  import type { LocalModel } from '../shared/types'
  import { ElMessageBox } from 'element-plus'
  import { BrewStore } from '@/store/brew'
  import { I18nT } from '@lang/index'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { escapeNoticeText } from './notice'

  const { tab, checkVersion } = AppModuleSetup('llama-cpp')
  const tabs = [
    LlamaCppT('service'),
    LlamaCppT('versionManager'),
    LlamaCppT('models'),
    LlamaCppT('settings'),
    LlamaCppT('logs')
  ]
  onMounted(() => LlamaCppManager.init())
  checkVersion()
  const settingsView = ref(),
    editingModelKey = ref<string>(),
    editingProjectorKey = ref<string>()
  const changeTab = async (value: number) => {
    if (tab.value === 3 && value !== 3 && !(await settingsView.value?.canLeave())) return
    tab.value = value
  }
  const openSettings = async (model?: LocalModel) => {
    if (tab.value === 3 && !(await settingsView.value?.canLeave())) return false
    editingModelKey.value = model ? modelFileKey(model) : LlamaCppManager.settings?.selectedModelKey
    editingProjectorKey.value = undefined
    await settingsView.value?.openModel()
    tab.value = 3
    return true
  }
  const associate = async (file: LocalModel) => {
    if (await openSettings(LlamaCppManager.selectedModel))
      editingProjectorKey.value = modelFileKey(file)
  }
  const openRepository = async (model?: LocalModel) => {
    if (!model) return
    tab.value = 2
    LlamaCppManager.modelView.activeTab = 'library'
    LlamaCppManager.modelView.query = model.repoId
    await LlamaCppManager.searchModelLibrary(0)
    await LlamaCppManager.setExpandedModelRepos([model.repoId])
  }
  let removeGuard: (() => void) | undefined
  onMounted(() => {
    removeGuard = router?.beforeEach(async (to: any, from: any) => {
      if (from.path === '/llama-cpp' && to.path !== from.path && tab.value === 3)
        return (await settingsView.value?.canLeave()) ?? true
      return true
    })
    LlamaCppManager.launch.refreshState().catch(() => {})
  })
  onUnmounted(() => removeGuard?.())
  const savedEndpoint = computed(
    () =>
      `http://${(LlamaCppManager.settings?.service.host ?? LlamaCppManager.profile.host).includes(':') ? `[${LlamaCppManager.settings?.service.host ?? LlamaCppManager.profile.host}]` : (LlamaCppManager.settings?.service.host ?? LlamaCppManager.profile.host)}:${LlamaCppManager.settings?.service.port ?? LlamaCppManager.profile.port}/v1`
  )
  const endpoint = computed(() => {
    const s = LlamaCppManager.launch.state.active?.launch.resolvedInput.service
    return s
      ? `http://${s.host.includes(':') ? '[' + s.host + ']' : s.host}:${s.port}/v1`
      : savedEndpoint.value
  })
  const currentVersion = computed(() => BrewStore().currentVersion('llama-cpp'))
  watch(
    () => currentVersion.value?.run,
    () => LlamaCppManager.launch.refreshState().catch(() => {})
  )
  const launchSummary = computed(() => {
    const state = LlamaCppManager.launch.state,
      active = state.active
    if (state.kind !== 'running-known' || !active)
      return {
        text: LlamaCppT(state.kind === 'stopped' ? 'notRunning' : 'unknownConfiguration'),
        detail: LlamaCppT('unknownConfiguration'),
        unknown: true,
        pending: false
      }
    let pending = false
    try {
      pending =
        launchConfigKey(LlamaCppManager.launchInput(), active.launch.runtimeKey) !==
          active.launch.requestKey || currentVersion.value?.bin !== active.launch.bin
    } catch {
      pending = true
    }
    const projector = active.launch.dependencies.find((d) => d.role === 'projector')
    return {
      pending,
      unknown: false,
      text: projector ? LlamaCppT('projectorLoaded') : LlamaCppT('textOnly'),
      detail:
        (projector?.path ?? '') +
        ' · ' +
        LlamaCppT('modalities') +
        ': ' +
        (active.observation.modalities?.join(', ') ?? LlamaCppT('unverified'))
    }
  })
  const selectableModels = computed(() =>
    LlamaCppManager.localModels.filter(
      (model) =>
        !isGGUFShardPath(model.path) &&
        (model.standalone ?? isStandaloneGGUFPath(model.path, model.repoId))
    )
  )
  const modelSwitchBusy = computed(
    () =>
      !!LlamaCppManager.modelSwitchOperation &&
      !['success', 'failed'].includes(LlamaCppManager.modelSwitchOperation.status)
  )
  const copyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(endpoint.value)
      MessageSuccess(I18nT('base.copySuccess'))
    } catch (error) {
      MessageError(escapeNoticeText(error))
    }
  }
  const selectModel = async (path: string) => {
    const model = LlamaCppManager.localModels.find((item) => item.localPath === path)
    if (!model || model.localPath === LlamaCppManager.selectedModel?.localPath) return
    const service = currentVersion.value
    if (service?.run) {
      try {
        await ElMessageBox.confirm(
          LlamaCppT('confirmSwitchModel').replace('{model}', model.path),
          LlamaCppT('switchModel'),
          { type: 'warning' }
        )
      } catch {
        return
      }
    }
    await LlamaCppManager.switchModel(model, service).catch(() => {})
  }
</script>
