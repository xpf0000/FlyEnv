<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="etcd" title="etcd"></Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="etcd"
        :has-static="true"
        :show-port-lib="false"
        url="https://github.com/etcd-io/etcd/releases"
        title="etcd"
      ></Manager>
      <Config v-if="tab === 2"></Config>
      <Logs v-if="tab === 3" type="out"></Logs>
      <Logs v-if="tab === 4" type="error"></Logs>
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

  const { tab, checkVersion } = AppModuleSetup('etcd')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log'),
    I18nT('base.errorLog')
  ]
  checkVersion()
</script>
