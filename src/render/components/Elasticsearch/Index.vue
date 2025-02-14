<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, index) in tabs" :key="index">
        <el-radio-button :label="item" :value="index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="elasticsearch" title="Elasticsearch"></Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="elasticsearch"
        :has-static="true"
        :show-port-lib="false"
        :show-brew-lib="false"
      ></Manager>
      <Config v-if="tab === 2" name="elasticsearch.yml" ext="yml"></Config>
      <Config v-if="tab === 3" name="jvm.options" ext="options"></Config>
      <Config v-if="tab === 4" name="log4j2.properties" ext="properties"></Config>
      <Logs v-if="tab === 5"></Logs>
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

  const { tab, checkVersion } = AppModuleSetup('elasticsearch')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    'elasticsearch.yml',
    'jvm.options',
    'log4j2.properties',
    I18nT('base.log')
  ]
  checkVersion()
</script>
