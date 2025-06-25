<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="ollama" title="Ollama"> </Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="ollama"
        :has-static="true"
        :show-port-lib="false"
        url="https://ollama.com/download"
        title="Ollama"
      ></Manager>
      <ModelsVM v-if="tab === 2" />
      <Config v-if="tab === 3"></Config>
      <Logs v-if="tab === 4"></Logs>
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
  import ModelsVM from './models/index.vue'

  const { tab, checkVersion } = AppModuleSetup('ollama')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('ollama.model'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]
  checkVersion()
</script>
