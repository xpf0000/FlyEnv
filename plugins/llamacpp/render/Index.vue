<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <el-radio-button v-for="(item, index) in tabs" :key="index" :label="item" :value="index" />
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="llama-cpp" title="llama.cpp" />
      <div v-else-if="tab === 1" class="p-4">{{ LlamaCppT('models') }}</div>
      <Manager v-else-if="tab === 2" type-flag="llama-cpp" title="llama.cpp" :has-static="false" />
      <div v-else class="p-4">{{ LlamaCppT('settings') }}</div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '@/components/ServiceManager/index.vue'
  import Manager from '@/components/VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { LlamaCppT } from './lang'

  const { tab } = AppModuleSetup('llama-cpp')
  const tabs = [LlamaCppT('service'), LlamaCppT('models'), LlamaCppT('runtime'), LlamaCppT('settings')]
</script>
