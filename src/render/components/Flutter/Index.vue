<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <ProjectIndex v-if="tab === 0" :title="I18nT('host.projectFlutter')" :type-flag="'flutter'">
      </ProjectIndex>
      <Service
        v-else-if="tab === 1"
        title="Flutter"
        type-flag="flutter"
        :fetch-data-when-create="true"
      ></Service>
      <Manager
        v-else-if="tab === 2"
        type-flag="flutter"
        title="Flutter"
        url="https://docs.flutter.dev/release/archive"
        :has-static="true"
        :show-brew-lib="false"
        :show-port-lib="false"
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

  const { tab } = AppModuleSetup('flutter')
  const tabs = [I18nT('host.projectFlutter'), I18nT('base.service'), I18nT('base.versionManager')]
</script>
