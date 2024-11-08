<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <template v-for="(item, index) in tabs" :key="index">
        <li :class="tab === index ? 'active' : ''" @click="tab = index">{{ item }}</li>
      </template>
    </ul>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="apache" title="Apache"></Service>
      <Manager v-else-if="tab === 1" type-flag="apache"></Manager>
      <Config v-else-if="tab === 2"></Config>
      <Logs v-else-if="tab === 3" type="error_log"></Logs>
      <Logs v-else-if="tab === 4" type="access_log"></Logs>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@web/core/Module'
  import { I18nT } from '@shared/lang'

  const { tab, checkVersion } = AppModuleSetup('apache')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.errorLog'),
    I18nT('base.log')
  ]
  checkVersion()
</script>
