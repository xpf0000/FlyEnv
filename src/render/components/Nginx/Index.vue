<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, index) in tabs" :key="index">
        <el-radio-button :label="item" :value="index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="nginx" title="Nginx"></Service>
      <Manager
        v-if="tab === 1"
        url="https://nginx.org/en/download.html"
        title="Nginx"
        type-flag="nginx"
      ></Manager>
      <Config v-if="tab === 2"></Config>
      <Logs v-if="tab === 3" type="error"></Logs>
      <Logs v-if="tab === 4" type="access"></Logs>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'

  const { tab, checkVersion } = AppModuleSetup('nginx')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.errorLog'),
    I18nT('base.log')
  ]
  checkVersion()
</script>
