<template>
  <div class="module-config">
    <el-card>
      <template #header
        ><span>{{ LlamaCppT('settings') }}</span></template
      >
      <el-scrollbar class="h-full p-4">
        <el-form label-width="150px" label-position="left" @submit.prevent="save">
          <el-form-item :label="LlamaCppT('host')"
            ><el-input v-model="profile.host"
          /></el-form-item>
          <el-form-item :label="LlamaCppT('port')"
            ><el-input-number v-model="profile.port" :min="1" :max="65535"
          /></el-form-item>
          <el-form-item :label="LlamaCppT('contextSize')">
            <div class="flex flex-col items-start gap-1">
              <el-input-number v-model="profile.contextSize" :min="128" :max="1048576" />
              <span class="text-xs opacity-70">{{ LlamaCppT('contextSizeHint') }}</span>
            </div>
          </el-form-item>
          <el-form-item :label="LlamaCppT('threads')"
            ><el-input-number v-model="profile.threads" :min="1" :max="512"
          /></el-form-item>
          <el-form-item :label="LlamaCppT('gpuLayers')"
            ><el-input-number v-model="profile.gpuLayers" :min="0" :max="999"
          /></el-form-item>
          <el-form-item :label="LlamaCppT('gpuDevice')"
            ><el-input v-model="profile.gpuDevice" placeholder="0"
          /></el-form-item>
          <el-form-item :label="LlamaCppT('apiKeyFile')"
            ><el-input :model-value="profile.apiKeyFile ?? LlamaCppT('none')" readonly
          /></el-form-item>
          <el-form-item :label="LlamaCppT('newApiKey')">
            <div class="flex w-full flex-col gap-2">
              <el-input
                v-model="apiKey"
                type="password"
                show-password
                :disabled="savingKey"
                :placeholder="LlamaCppT('apiKey')"
              />
              <div class="flex items-center gap-2">
                <el-button :disabled="savingKey" @click="apiKey = generateApiKey()">{{
                  LlamaCppT('generateKey')
                }}</el-button>
                <el-button :disabled="!apiKey || savingKey" @click="copyKey">{{
                  LlamaCppT('copyKey')
                }}</el-button>
                <el-button
                  type="primary"
                  :loading="savingKey"
                  :disabled="apiKey.length < 16 || savingKey"
                  @click="saveKey"
                  >{{ LlamaCppT('createKeyFile') }}</el-button
                >
              </div>
            </div>
          </el-form-item>
          <el-alert :title="LlamaCppT('nonLoopbackNote')" type="info" :closable="false" />
        </el-form>
      </el-scrollbar>
      <template #footer
        ><el-button type="primary" @click="save">{{ LlamaCppT('save') }}</el-button></template
      >
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted, reactive, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { clipboard } from '@/util/NodeFn'
  import { generateApiKey } from './key'
  import { LlamaCppManager } from '../controller'
  import { LlamaCppT } from '../lang'
  import { escapeNoticeText } from '../notice'

  const profile = reactive({ ...LlamaCppManager.profile })
  const apiKey = ref('')
  const savingKey = ref(false)

  onMounted(async () => {
    await LlamaCppManager.init()
    Object.assign(profile, LlamaCppManager.profile)
  })
  const save = async () => {
    try {
      await LlamaCppManager.saveProfile(profile)
      MessageSuccess(I18nT('base.success'))
    } catch (e) {
      MessageError(escapeNoticeText(e))
    }
  }
  const copyKey = async () => {
    if (!apiKey.value) return
    try {
      await clipboard.writeText(apiKey.value)
      MessageSuccess(I18nT('base.copySuccess'))
    } catch (error) {
      MessageError(escapeNoticeText(error))
    }
  }
  const saveKey = async () => {
    savingKey.value = true
    try {
      profile.apiKeyFile = await LlamaCppManager.createApiKeyFile(apiKey.value)
      await LlamaCppManager.saveProfile(profile)
      MessageSuccess(I18nT('base.success'))
    } catch (e) {
      MessageError(escapeNoticeText(e))
    } finally {
      savingKey.value = false
    }
  }
</script>
