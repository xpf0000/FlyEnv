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
    </div>
  </div>
</template>

<script lang="ts" setup>
  import ServiceList from './Service.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'
  import ConfigVM from './Config.vue'

  const { tab } = AppModuleSetup('openclaw')
  const tabs = [I18nT('base.service'), I18nT('base.configFile')]
</script>
