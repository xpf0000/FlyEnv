<template>
  <div v-if="draft" class="settings-page">
    <el-scrollbar class="settings-scroll">
      <el-form class="settings-form settings-grid" label-position="top" @submit.prevent>
        <el-form-item :label="t('host')">
          <el-input v-model="draft.value.host" />
          <p class="settings-hint">{{ t('nonLoopbackNote') }}</p>
        </el-form-item>
        <el-form-item :label="t('port')">
          <el-input-number v-model="draft.value.port" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item class="settings-span-full" :label="t('modelsDirectory')">
          <el-input :model-value="draft.value.modelsDirectory || manager.defaultModelsRoot" readonly />
          <div class="settings-button-row settings-field-actions">
            <el-button @click="chooseModelsDirectory">{{ t('chooseFolder') }}</el-button>
            <el-button
              v-if="draft.value.modelsDirectory"
              @click="draft.value.modelsDirectory = undefined"
              >{{ t('useDefaultFolder') }}</el-button
            >
          </div>
          <p class="settings-hint">{{ t('modelsDirectoryHint') }}</p>
        </el-form-item>
        <el-form-item class="settings-span-full" :label="t('apiKeyFile')">
          <el-input :model-value="draft.value.apiKeyFile" readonly />
        </el-form-item>
        <el-form-item class="settings-span-full" :label="t('newApiKey')">
          <el-input v-model="apiKey" type="password" show-password />
          <div class="settings-button-row settings-field-actions">
            <el-button @click="apiKey = generateApiKey()">{{ t('generateKey') }}</el-button>
            <el-button :disabled="apiKey.length < 16" :loading="saving" @click="saveKey">{{
              t('createKeyFile')
            }}</el-button>
          </div>
        </el-form-item>
        <el-alert
          v-if="error"
          class="settings-span-full"
          :title="error"
          type="error"
          :closable="false"
        />
      </el-form>
    </el-scrollbar>
    <div class="settings-actions">
      <div class="settings-button-row"
        ><el-button @click="reload">{{ t('discard') }}</el-button></div
      >
      <div class="settings-button-row">
        <el-button type="primary" :loading="saving" @click="save().catch(() => {})">{{
          t('save')
        }}</el-button>
        <el-button v-if="current" :loading="saving" @click="apply">{{
          t(current.run ? 'saveAndRestart' : 'saveAndStart')
        }}</el-button>
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
  import { ref, reactive, onMounted, computed } from 'vue'
  import { ElMessageBox } from 'element-plus'
  import { BrewStore } from '@/store/brew'
  import { LlamaCppManager as manager } from '../controller'
  import { LlamaCppT as t } from '../lang'
  import { SettingsDraft } from './useSettingsDraft'
  import type { ServiceSettings } from '../../shared/settings'
  import { generateApiKey } from './key'
  const draft = ref<SettingsDraft<ServiceSettings>>(),
    apiKey = ref(''),
    saving = ref(false),
    error = ref('')
  const current = computed(() => BrewStore().currentVersion('llama-cpp'))
  const reload = () => {
    draft.value = reactive(new SettingsDraft(manager.settings.service))
  }
  const save = async () => {
    if (!draft.value) return
    saving.value = true
    try {
      await manager.launch.saveService(draft.value.value)
      manager.syncProfile()
      reload()
    } catch (e) {
      error.value = String(e)
      throw e
    } finally {
      saving.value = false
    }
  }
  const saveKey = async () => {
    if (!draft.value) return
    saving.value = true
    try {
      draft.value.value.apiKeyFile = await manager.createApiKeyFile(apiKey.value)
      apiKey.value = ''
    } catch (e) {
      error.value = String(e)
    } finally {
      saving.value = false
    }
  }
  const chooseModelsDirectory = async () => {
    if (!draft.value) return
    try {
      const directory = await manager.chooseModelsDirectory()
      if (directory) draft.value.value.modelsDirectory = directory
    } catch (e) {
      error.value = String(e)
    }
  }
  const apply = async () => {
    if (!draft.value || !current.value) return
    saving.value = true
    try {
      await manager.launch.applyService(draft.value.value, current.value, current.value)
      manager.syncProfile()
      reload()
    } catch (e) {
      error.value = String(e)
    } finally {
      saving.value = false
    }
  }
  const canLeave = async () => {
    if (!draft.value) return true
    try {
      return await draft.value.requestLeave(async () => {
        try {
          await ElMessageBox.confirm(t('unsaved'), t('serviceSettings'), {
            confirmButtonText: t('save'),
            cancelButtonText: t('discard'),
            distinguishCancelAndClose: true
          })
          return 'save'
        } catch (a) {
          return a === 'cancel' ? 'discard' : 'cancel'
        }
      }, save)
    } catch {
      return false
    }
  }
  onMounted(async () => {
    await manager.init()
    reload()
  })
  defineExpose({ canLeave })
</script>
