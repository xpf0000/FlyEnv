<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, index) in tabs" :key="index">
        <el-radio-button :label="item" :value="index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Versions v-if="tab === 0"></Versions>
      <Config v-if="tab === 1" />
      <Create v-if="tab === 2" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Versions from './List.vue'
  import Config from './Config.vue'
  import { AppModuleSetup } from '@web/core/Module'
  import { I18nT } from '@shared/lang'
  import Create from './CreateProject.vue'

  const { tab } = AppModuleSetup('node')
  const tabs = ['NodeJS', '.npmrc', I18nT('host.newProject')]
</script>
