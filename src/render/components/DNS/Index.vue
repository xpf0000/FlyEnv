<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0"></Service>
      <Config v-if="tab === 1"></Config>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from './service.vue'
  import Config from './Config.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'

  const { tab } = AppModuleSetup('dns')
  const tabs = [I18nT('base.service'), I18nT('base.configFile')]
</script>
