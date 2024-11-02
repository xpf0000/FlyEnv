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
      <Service v-if="tab === 0" type-flag="memcached" title="Memcached"></Service>
      <Manager
        v-else-if="tab === 1"
        url="https://github.com/nono303/memcached"
        title="Memcached"
        type-flag="memcached"
      >
      </Manager>
      <Logs v-else-if="tab === 2"></Logs>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '../ServiceManager/index.vue'
  import Logs from './Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@shared/lang'

  const { tab, checkVersion } = AppModuleSetup('memcached')
  const tabs = [I18nT('base.service'), I18nT('base.versionManager'), I18nT('base.log')]
  checkVersion()
</script>
