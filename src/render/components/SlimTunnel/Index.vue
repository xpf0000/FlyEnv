<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index" />
      </template>
    </el-radio-group>
    <div class="main-block">
      <Setup v-if="tab === 0" />
      <ServiceList v-else-if="tab === 1" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Setup from './Setup.vue'
  import ServiceList from './List.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'

  const { tab } = AppModuleSetup('slim-tunnel')
  const tabs = [I18nT('base.setupBase'), I18nT('base.service')]
</script>
