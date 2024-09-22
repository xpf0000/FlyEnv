<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <template v-for="(item, index) in tabs" :key="index">
        <li :class="tab === index ? 'active' : ''" @click="tab = index">{{ item }}</li>
      </template>
    </ul>
    <div class="main-block">
      <Service v-if="tab === 0"></Service>
      <Manager v-else-if="tab === 1" type-flag="java"></Manager>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from './List.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@shared/lang'

  const { tab } = AppModuleSetup('java')
  const tabs = [I18nT('base.service'), I18nT('base.versionManager')]
</script>
