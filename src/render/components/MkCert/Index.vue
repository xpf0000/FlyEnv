<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="mkcert" title="mkcert"></Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="mkcert"
        title="mkcert"
        :has-static="true"
        :show-port-lib="false"
        :show-brew-lib="true"
        url="https://github.com/FiloSottile/mkcert/releases"
      >
      </Manager>
      <Certs v-else-if="tab === 2"></Certs>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Certs from './Certs.vue'
  import { I18nT } from '@lang/index'
  import Service from '@/components/ServiceManager/base.vue'
  import Manager from '@/components/VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'

  const { tab, checkVersion } = AppModuleSetup('mkcert')
  const tabs = [I18nT('base.service'), I18nT('base.versionManager'), I18nT('mkcert.certificates')]
  checkVersion()
</script>
