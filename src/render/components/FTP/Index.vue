<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <li
        v-for="(item, index) in tabs"
        :key="index"
        :class="tab === index ? 'active' : ''"
        @click="tab = index"
        >{{ item }}</li
      >
    </ul>
    <div class="main-block">
      <Service v-if="tab === 0"></Service>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from './Service.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@shared/lang'

  const { tab } = AppModuleSetup('pure-ftpd')
  const tabs = [I18nT('base.service')]
</script>
