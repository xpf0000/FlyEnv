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
          <el-form-item :label="LlamaCppT('contextSize')"
            ><el-input-number v-model="profile.contextSize" :min="128" :max="1048576"
          /></el-form-item>
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
            <el-input
              v-model="apiKey"
              type="password"
              show-password
              :placeholder="LlamaCppT('apiKey')"
            >
              <template #append
                ><el-button :loading="savingKey" @click="saveKey">{{
                  LlamaCppT('createKeyFile')
                }}</el-button></template
              >
            </el-input>
          </el-form-item>
          <el-alert :title="LlamaCppT('nonLoopbackNote')" type="info" :closable="false" />
          <el-alert v-if="error" class="mt-3" :title="error" type="error" :closable="false" />
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
  import { LlamaCppManager } from '../controller'
  import { LlamaCppT } from '../lang'

  const profile = reactive({ ...LlamaCppManager.profile })
  const apiKey = ref('')
  const savingKey = ref(false)
  const error = ref('')

  onMounted(async () => {
    await LlamaCppManager.init()
    Object.assign(profile, LlamaCppManager.profile)
  })
  const save = async () => {
    error.value = ''
    try {
      await LlamaCppManager.saveProfile(profile)
    } catch (e) {
      error.value = `${e}`
    }
  }
  const saveKey = async () => {
    savingKey.value = true
    error.value = ''
    try {
      profile.apiKeyFile = await LlamaCppManager.createApiKeyFile(apiKey.value)
      apiKey.value = ''
      await LlamaCppManager.saveProfile(profile)
    } catch (e) {
      error.value = `${e}`
    } finally {
      savingKey.value = false
    }
  }
</script>
