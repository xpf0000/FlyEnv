<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, index) in tabs" :key="index">
        <el-radio-button :label="item" :value="index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service
        v-if="tab === 0"
        title="Go"
        type-flag="golang"
        :fetch-data-when-create="true"
      ></Service>
      <Manager v-else-if="tab === 1" type-flag="golang" :has-static="true"></Manager>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '@/components/ServiceManager/base.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@shared/lang'

  const { tab } = AppModuleSetup('golang')
  const tabs = [I18nT('base.service'), I18nT('base.versionManager')]
</script>
