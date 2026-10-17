<template>
  <el-scrollbar
    ><el-form v-if="draft" class="p-4" label-width="180px" @submit.prevent
      ><el-form-item :label="t('host')"><el-input v-model="draft.value.host" /></el-form-item
      ><el-form-item :label="t('port')"
        ><el-input-number v-model="draft.value.port" :min="1" :max="65535" /></el-form-item
      ><el-form-item :label="t('apiKeyFile')"
        ><el-input :model-value="draft.value.apiKeyFile" readonly /></el-form-item
      ><el-form-item :label="t('newApiKey')"
        ><div class="flex w-full flex-col gap-2"
          ><el-input v-model="apiKey" type="password" show-password /><div class="flex gap-2"
            ><el-button @click="apiKey = generateApiKey()">{{ t('generateKey') }}</el-button
            ><el-button :disabled="apiKey.length < 16" :loading="saving" @click="saveKey">{{
              t('createKeyFile')
            }}</el-button></div
          ></div
        ></el-form-item
      ><el-alert :title="t('nonLoopbackNote')" type="info" :closable="false" /><p
        v-if="error"
        class="mt-3 break-all"
        >{{ error }}</p
      ><div class="mt-4 flex gap-2"
        ><el-button type="primary" :loading="saving" @click="save().catch(() => {})">{{
          t('save')
        }}</el-button
        ><el-button @click="reload">{{ t('discard') }}</el-button
        ><el-button v-if="current" :loading="saving" @click="apply">{{
          t(current.run ? 'saveAndRestart' : 'saveAndStart')
        }}</el-button></div
      ></el-form
    ></el-scrollbar
  >
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
