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
        title="Erlang"
        type-flag="erlang"
        :fetch-data-when-create="true"
      ></Service>
      <Manager v-else-if="tab === 1" type-flag="erlang" :has-static="false"></Manager>
      <ProjectIndex
        v-else-if="tab === 2"
        :title="`Erlang ${I18nT('base.projects')}`"
        :type-flag="'erlang'"
      >
      </ProjectIndex>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '@/components/ServiceManager/base.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'
  import ProjectIndex from '@/components/PHP/projects/index.vue'

  const { tab } = AppModuleSetup('erlang')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    `Erlang ${I18nT('base.projects')}`
  ]
</script>
