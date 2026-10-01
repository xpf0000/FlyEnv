<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <el-radio-button v-for="(item, index) in tabs" :key="index" :label="item" :value="index" />
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="llama-cpp" title="llama.cpp">
        <template #tool-left>
          <el-popover placement="bottom" width="480" trigger="click">
            <template #reference>
              <el-button link class="ml-3 max-w-64">
                <span class="truncate"
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
                  :placeholder="LlamaCppT('none')"
                  @change="selectModel"
                >
                  <el-option
                    v-for="model in LlamaCppManager.localModels"
                    :key="model.localPath"
                    :label="model.path"
                    :value="model.localPath"
                  />
                </el-select>
              </el-descriptions-item>
              <el-descriptions-item :label="LlamaCppT('endpoint')">{{
                endpoint
              }}</el-descriptions-item>
            </el-descriptions>
            <el-button class="mt-3" size="small" @click="copyEndpoint">{{
              LlamaCppT('copyEndpoint')
            }}</el-button>
          </el-popover>
        </template>
      </Service>
      <RuntimeView v-else-if="tab === 1" />
      <ModelsView v-else-if="tab === 2" />
      <SettingsView v-else-if="tab === 3" />
      <LogsView v-else />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '@/components/ServiceManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { LlamaCppT } from './lang'
  import { LlamaCppManager } from './controller'
  import ModelsView from './models/Index.vue'
  import RuntimeView from './runtime/Index.vue'
  import SettingsView from './settings/Index.vue'
  import LogsView from './logs/Index.vue'
  import { computed, onMounted } from 'vue'
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
  const endpoint = computed(
    () =>
      `http://${LlamaCppManager.profile.host.includes(':') ? `[${LlamaCppManager.profile.host}]` : LlamaCppManager.profile.host}:${LlamaCppManager.profile.port}/v1`
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
    if (!model) return
    try {
      await LlamaCppManager.selectModel(model)
    } catch (error) {
      MessageError(escapeNoticeText(error))
    }
  }
</script>
