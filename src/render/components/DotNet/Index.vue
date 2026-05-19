<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <ProjectIndex v-if="tab === 0" :title="I18nT('host.projectDotnet')" :type-flag="'dotnet'">
        <template #openin="{ row }">
          <li @click.stop="Project.openPath(row.path, 'VSCode')">
            <yb-icon :svg="import('@/svg/vscode.svg?raw')" width="13" height="13" />
            <span class="ml-3">{{ I18nT('nodejs.openIN') }} {{ I18nT('nodejs.VSCode') }}</span>
          </li>
        </template>
      </ProjectIndex>
      <Service
        v-else-if="tab === 1"
        title=".NET"
        type-flag="dotnet"
        :fetch-data-when-create="true"
      ></Service>
      <Manager v-else-if="tab === 2" type-flag="dotnet" title=".NET" :has-static="true" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '@/components/ServiceManager/base.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'
  import ProjectIndex from '@/components/LanguageProjects/index.vue'
  import { Project } from '@/util/Project'

  const { tab } = AppModuleSetup('dotnet')
  const tabs = [I18nT('host.projectDotnet'), I18nT('base.service'), I18nT('base.versionManager')]
</script>
