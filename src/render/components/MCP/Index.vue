<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <ServiceVM v-if="tab === 0"></ServiceVM>
      <ClientConfigVM v-else-if="tab === 1"></ClientConfigVM>
      <ToolsVM v-else-if="tab === 2"></ToolsVM>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import ServiceVM from './Service.vue'
  import ClientConfigVM from './ClientConfig.vue'
  import ToolsVM from './Tools.vue'
  import { I18nT } from '@lang/index'

  const tab = ref(0)
  const tabs = [I18nT('mcp.service'), I18nT('mcp.clientConfig'), I18nT('mcp.tools')]
</script>
