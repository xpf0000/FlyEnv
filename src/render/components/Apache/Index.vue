<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, index) in tabs" :key="index">
        <el-radio-button :label="item" :value="index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="apache" title="Apache"></Service>
      <Manager
        v-if="tab === 1"
        url="https://www.apachelounge.com/download/"
        title="Apache"
        type-flag="apache"
      >
      </Manager>
      <Config v-else-if="tab === 2"></Config>
      <Logs v-else-if="tab === 3" type="error"></Logs>
      <Logs v-else-if="tab === 4" type="access"></Logs>
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
