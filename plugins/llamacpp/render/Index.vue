<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <el-radio-button v-for="(item, index) in tabs" :key="index" :label="item" :value="index" />
    </el-radio-group>
    <div class="main-block">
      <section v-if="tab === 0" class="p-4">
        <Service type-flag="llama-cpp" title="llama.cpp" />
        <div class="mt-4 rounded border p-3">
          <div>{{ LlamaCppT('selectedModel') }}: {{ LlamaCppManager.selectedModel?.repoId ?? LlamaCppT('none') }}</div>
          <div class="mt-1">{{ LlamaCppT('endpoint') }}: http://{{ LlamaCppManager.profile.host }}:{{ LlamaCppManager.profile.port }}/v1</div>
          <el-button class="mt-2" size="small" @click="copyEndpoint">{{ LlamaCppT('copyEndpoint') }}</el-button>
        </div>
      </section>
      <ModelsView v-else-if="tab === 1" />
      <RuntimeView v-else-if="tab === 2" />
      <SettingsView v-else />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '@/components/ServiceManager/index.vue'
  import Manager from '@/components/VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { LlamaCppT } from './lang'
  import { LlamaCppManager } from './controller'
  import ModelsView from './models/Index.vue'
  import RuntimeView from './runtime/Index.vue'
  import SettingsView from './settings/Index.vue'
  import { onMounted } from 'vue'

  const { tab } = AppModuleSetup('llama-cpp')
  const tabs = [LlamaCppT('service'), LlamaCppT('models'), LlamaCppT('runtime'), LlamaCppT('settings')]
  onMounted(() => LlamaCppManager.init())
  const copyEndpoint = () => navigator.clipboard.writeText(`http://${LlamaCppManager.profile.host}:${LlamaCppManager.profile.port}/v1`)
</script>
