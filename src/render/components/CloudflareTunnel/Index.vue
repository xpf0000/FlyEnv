<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <ServiceList v-if="tab === 0"></ServiceList>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import ServiceList from './List.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'

  const { tab } = AppModuleSetup('cloudflare-tunnel')
  const tabs = [I18nT('base.service')]
</script>
