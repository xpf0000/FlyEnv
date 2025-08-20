<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service
        v-if="tab === 0"
        title="Gradle"
        type-flag="gradle"
        :fetch-data-when-create="true"
      ></Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="gradle"
        title="Gradle"
        url="https://gradle.org/releases/"
        :has-static="true"
        :show-port-lib="true"
        :show-brew-lib="true"
      ></Manager>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '@/components/ServiceManager/base.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'

  const { tab } = AppModuleSetup('gradle')
  const tabs = [I18nT('base.service'), I18nT('base.versionManager')]
</script>
