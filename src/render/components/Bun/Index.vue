<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <ProjectIndex
        v-if="tab === 0"
        :title="I18nT('host.projectBun')"
        :type-flag="'bun'"
      ></ProjectIndex>
      <Service
        v-else-if="tab === 1"
        title="Bun"
        type-flag="bun"
        :fetch-data-when-create="true"
      ></Service>
      <Manager
        v-else-if="tab === 2"
        type-flag="bun"
        title="Bun"
        url="https://github.com/oven-sh/bun/releases/"
        :has-static="true"
        :show-port-lib="false"
        :show-brew-lib="false"
      ></Manager>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '@/components/ServiceManager/base.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'
  import ProjectIndex from '@/components/LanguageProjects/index.vue'

  const { tab } = AppModuleSetup('bun')
  const tabs = [I18nT('host.projectBun'), I18nT('base.service'), I18nT('base.versionManager')]
</script>
