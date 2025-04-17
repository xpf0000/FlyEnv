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
      <ProjectIndex v-else-if="tab === 2" :title="I18nT('host.projectGo')" :type-flag="'golang'">
        <template #openin="{ row }">
          <li @click.stop="Project.openPath(row.path, 'GoLand')">
            <yb-icon :svg="import('@/svg/goland.svg?raw')" width="13" height="13" />
            <span class="ml-15">{{ I18nT('nodejs.openIN') }} GoLand</span>
          </li>
        </template>
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
  import { Project } from '@/util/Project'

  const { tab } = AppModuleSetup('golang')
  const tabs = [I18nT('base.service'), I18nT('base.versionManager'), I18nT('host.projectGo')]
</script>
