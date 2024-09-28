<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <li v-for="(item, index) in tabs" :key="index" :class="tab === index ? 'active' : ''" @click="tab = index">{{ item
        }}</li>
    </ul>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="caddy" title="Caddy"></Service>
      <Manager v-else-if="tab === 1" url="https://github.com/caddyserver/caddy/releases" title="Caddy"
        type-flag="caddy"></Manager>
      <Config v-else-if="tab === 2"></Config>
      <Logs v-else-if="tab === 3"></Logs>
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

const { tab, checkVersion } = AppModuleSetup('caddy')
const tabs = [
  I18nT('base.service'),
  I18nT('base.versionManager'),
  I18nT('base.configFile'),
  I18nT('base.log')
]
checkVersion()
</script>
