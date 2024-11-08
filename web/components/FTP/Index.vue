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
      <Manager v-else-if="tab === 1" type-flag="pure-ftpd"></Manager>
      <Config v-if="tab === 2"></Config>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from './Service.vue'
  import Config from './Config.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@web/core/Module'
  import { I18nT } from '@shared/lang'

  const { tab, checkVersion } = AppModuleSetup('pure-ftpd')
  const tabs = [I18nT('base.service'), I18nT('base.versionManager'), I18nT('base.configFile')]
  checkVersion()
</script>
