<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <li v-for="(item, index) in tabs" :key="index" :class="tab === index ? 'active' : ''" @click="tab = index">{{ item
        }}</li>
    </ul>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="mariadb" title="MariaDB"></Service>
      <Manager v-else-if="tab === 1" url="https://mariadb.com/downloads/" title="Mariadb" type-flag="mariadb"></Manager>
      <Config v-else-if="tab === 2"></Config>
      <Logs v-else-if="tab === 3" type="error"></Logs>
      <Logs v-else-if="tab === 4" type="slow"></Logs>
    </div>
  </div>
</template>

<script lang="ts" setup>
import Service from '../ServiceManager/index.vue'
import Config from './Config.vue'
import Logs from './Logs.vue'
import Manager from '../VersionManager/index.vue'
import { AppModuleSetup } from '@/core/Module'
import { I18nT } from '@shared/lang'

const { tab, checkVersion } = AppModuleSetup('mariadb')
const tabs = [
  I18nT('base.service'),
  I18nT('base.versionManager'),
  I18nT('base.configFile'),
  I18nT('base.log'),
  I18nT('base.slowLog')
]
checkVersion()
</script>
