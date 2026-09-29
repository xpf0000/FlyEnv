<template>
  <div class="space-y-4 p-4">
    <h3 class="font-semibold">{{ LlamaCppT('settings') }}</h3>
    <div class="grid grid-cols-2 gap-3">
      <label>{{ LlamaCppT('host') }}<el-input v-model="profile.host" /></label>
      <label>{{ LlamaCppT('port') }}<el-input-number v-model="profile.port" :min="1" :max="65535" /></label>
      <label>{{ LlamaCppT('contextSize') }}<el-input-number v-model="profile.contextSize" :min="128" :max="1048576" /></label>
      <label>{{ LlamaCppT('threads') }}<el-input-number v-model="profile.threads" :min="1" :max="512" /></label>
      <label>{{ LlamaCppT('gpuLayers') }}<el-input-number v-model="profile.gpuLayers" :min="0" :max="999" /></label>
      <label>{{ LlamaCppT('gpuDevice') }}<el-input v-model="profile.gpuDevice" placeholder="0" /></label>
    </div>
    <div class="rounded border p-3">
      <div>{{ LlamaCppT('apiKeyFile') }}: {{ profile.apiKeyFile ?? LlamaCppT('none') }}</div>
      <div class="mt-2 flex gap-2">
        <el-input v-model="apiKey" type="password" show-password :placeholder="LlamaCppT('apiKey')" />
        <el-button :loading="savingKey" @click="saveKey">{{ LlamaCppT('createKeyFile') }}</el-button>
      </div>
      <small>{{ LlamaCppT('nonLoopbackNote') }}</small>
    </div>
    <p v-if="error" class="text-red-500">{{ error }}</p>
    <el-button type="primary" @click="save">{{ LlamaCppT('save') }}</el-button>
    <h3 class="pt-3 font-semibold">{{ LlamaCppT('settings') }}</h3>
    <Log v-if="logFile" :log-file="logFile" class="h-64" />
  </div>
</template>

<script lang="ts" setup>
  import { onMounted, reactive, ref } from 'vue'
  import { BrewStore } from '@/store/brew'
  import Log from '@/components/Log/index.vue'
  import { LlamaCppManager } from '../controller'
  import { LlamaCppT } from '../lang'

  const profile = reactive({ ...LlamaCppManager.profile })
  const apiKey = ref('')
  const savingKey = ref(false)
  const error = ref('')
  const logFile = ref('')
  onMounted(async () => {
    await LlamaCppManager.init()
    Object.assign(profile, LlamaCppManager.profile)
    const installed = BrewStore().module('llama-cpp').installed[0]
    if (installed) {
      const logs = await LlamaCppManager.request<Array<{ name: string; path: string; exists: boolean }>>('listLogFiles', JSON.parse(JSON.stringify(installed))).catch(() => [])
      logFile.value = logs.find((item) => item.name === 'stderr')?.path ?? logs[0]?.path ?? ''
    }
  })
  const save = async () => {
    error.value = ''
    try { await LlamaCppManager.saveProfile(profile) } catch (e) { error.value = `${e}` }
  }
  const saveKey = async () => {
    savingKey.value = true
    error.value = ''
    try {
      profile.apiKeyFile = await LlamaCppManager.createApiKeyFile(apiKey.value)
      apiKey.value = ''
      await LlamaCppManager.saveProfile(profile)
    } catch (e) { error.value = `${e}` } finally { savingKey.value = false }
  }
</script>
