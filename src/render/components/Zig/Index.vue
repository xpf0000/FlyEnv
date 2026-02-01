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
        title="Zig"
        type-flag="zig"
        :fetch-data-when-create="true"
      ></Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="zig"
        title="Zig"
        url="https://ziglang.org/download/"
        :has-static="true"
      ></Manager>
      <ProjectIndex v-else-if="tab === 2" :title="projectTitle" :type-flag="'zig'"></ProjectIndex>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import Service from '@/components/ServiceManager/base.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'
  import ProjectIndex from '@/components/LanguageProjects/index.vue'

  const projectTitle = computed(() => {
    return `Zig ${I18nT('base.projects')}`
  })

  const { tab } = AppModuleSetup('zig')
  const tabs = [I18nT('base.service'), I18nT('base.versionManager'), projectTitle]
</script>
