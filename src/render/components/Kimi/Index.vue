<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <ServiceList v-if="tab === 0"></ServiceList>
      <ConfigVM v-else-if="tab === 1"></ConfigVM>
      <LogsVM v-else-if="tab === 2"></LogsVM>
      <SessionsVM v-else-if="tab === 3"></SessionsVM>
      <McpVM v-else-if="tab === 4"></McpVM>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import ServiceList from './Service.vue'
  import ConfigVM from './Config.vue'
  import SessionsVM from './Sessions.vue'
  import LogsVM from './Logs.vue'
  import McpVM from './MCP.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'

  const { tab } = AppModuleSetup('kimi')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.configFile'),
    I18nT('base.log'),
    I18nT('common.session.list'),
    I18nT('kimi.mcp')
  ]
</script>
