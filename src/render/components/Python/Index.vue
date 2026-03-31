<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <ProjectIndex v-if="tab === 0" :title="I18nT('host.projectPython')" :type-flag="'python'">
        <template #openin="{ row }">
          <el-dropdown-item @click="Project.openPath(row.path, 'PyCharm')">
            <template #icon>
              <yb-icon :svg="import('@/svg/pycharm.svg?raw')" width="13" height="13" />
            </template>
            <template #default>
              <span class="ml-3">{{ I18nT('nodejs.openIN') }} PyCharm</span>
            </template>
          </el-dropdown-item>
        </template>
      </ProjectIndex>
      <Service
        v-else-if="tab === 1"
        title="Python"
        type-flag="python"
        :fetch-data-when-create="true"
      ></Service>
      <Manager v-else-if="tab === 2" type-flag="python" title="Python"></Manager>
      <ProjectCreateVM v-else-if="tab === 3" />
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
  import ProjectCreateVM from './CreateProject.vue'

  const { tab } = AppModuleSetup('python')
  const tabs = [
    I18nT('host.projectPython'),
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('host.newProject')
  ]
</script>
