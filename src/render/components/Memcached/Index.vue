<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="memcached" title="Memcached"></Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="memcached"
        url="https://github.com/nono303/memcached"
        title="Memcached"
      ></Manager>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '../ServiceManager/index.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'

  const { tab, checkVersion } = AppModuleSetup('memcached')
  const tabs = [I18nT('base.service'), I18nT('base.versionManager')]
  checkVersion()
</script>
