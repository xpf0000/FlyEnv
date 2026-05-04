<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <CreateProject v-model="showCreate" @created="onProjectCreated" />
      <EditProject v-model="showProjectEdit" :project-path="editingProjectPath" />
      <GeneralTab v-if="tab === 0" />
      <ProjectIndex
        v-else-if="tab === 1"
        :title="I18nT('host.projectFlutter')"
        :type-flag="'flutter'"
        :hide-default-edit="true"
      >
        <template #header-actions>
          <el-button link @click="showCreate = true">
            <yb-icon :svg="import('@/svg/code-library.svg?raw')" width="20" height="20" />
          </el-button>
        </template>
        <template #operation="scope">
          <li @click.stop="openProjectEdit(scope.row.path)">
            <yb-icon :svg="import('@/svg/edit.svg?raw')" width="13" height="13" />
            <span class="ml-3">{{ I18nT('base.edit') }} (Flutter)</span>
          </li>
        </template>
      </ProjectIndex>
      <Service
        v-else-if="tab === 2"
        title="Flutter"
        type-flag="flutter"
        :fetch-data-when-create="true"
      ></Service>
      <Manager
        v-else-if="tab === 3"
        type-flag="flutter"
        title="Flutter"
        url="https://docs.flutter.dev/release/archive"
        :has-static="true"
        :show-brew-lib="false"
        :show-port-lib="false"
      ></Manager>
      <AndroidToolchain v-else-if="tab === 4" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '@/components/ServiceManager/base.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'
  import ProjectIndex from '@/components/LanguageProjects/index.vue'
  import AndroidToolchain from './AndroidToolchain.vue'
  import GeneralTab from './General.vue'
  import CreateProject from './CreateProject.vue'
  import EditProject from './EditProject.vue'
  import { ref } from 'vue'

  const { tab } = AppModuleSetup('flutter')
  const showCreate = ref(false)
  const showProjectEdit = ref(false)
  const editingProjectPath = ref('')
  const tabs = [
    'General',
    I18nT('host.projectFlutter'),
    I18nT('base.service'),
    I18nT('base.versionManager'),
    'Android'
  ]

  const openProjectEdit = (path: string) => {
    editingProjectPath.value = path
    showProjectEdit.value = true
  }

  const onProjectCreated = (_projectPath: string) => {
    // already added via ProjectSetup inside CreateProject.vue — switch to Projects tab
    tab.value = 1
  }
</script>
