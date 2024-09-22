<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <li
        v-for="(item, index) in tabs"
        :key="index"
        :class="{
          active: tab === index,
          grouprun: index === 5 && groupRun
        }"
        @click="tab = index"
        >{{ item }}</li
      >
    </ul>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="mysql" title="Mysql"></Service>
      <Manager v-else-if="tab === 1" type-flag="mysql"></Manager>
      <Config v-if="tab === 2"></Config>
      <Logs v-if="tab === 3" type="error"></Logs>
      <Logs v-if="tab === 4" type="slow"></Logs>
      <Group v-if="tab === 5"></Group>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import Group from './Group/Index.vue'
  import { MysqlStore } from './mysql'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@shared/lang'
  const mysqlStore = MysqlStore()
  const { tab, checkVersion } = AppModuleSetup('mysql')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log'),
    I18nT('base.slowLog'),
    I18nT('base.group')
  ]
  const groupRun = computed(() => {
    return mysqlStore.all.some((a) => a.version.running)
  })
  checkVersion()
</script>
