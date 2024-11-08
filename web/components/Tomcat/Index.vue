<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <template v-for="(item, index) in tabs" :key="index">
        <li :class="tab === index ? 'active' : ''" @click="tab = index">{{ item }}</li>
      </template>
    </ul>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="tomcat" title="Tomcat"></Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="tomcat"
        :has-static="true"
        :show-port-lib="false"
      ></Manager>
      <Config v-else-if="tab === 2" :file-name="'server.xml'"></Config>
      <Config v-else-if="tab === 3" :file-name="'web.xml'"></Config>
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

  const { tab, checkVersion } = AppModuleSetup('nginx')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    'server.xml',
    'web.xml',
    I18nT('base.log')
  ]
  checkVersion()
</script>
