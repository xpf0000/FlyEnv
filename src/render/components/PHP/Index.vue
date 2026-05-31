<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <ProjectIndex v-if="tab === 0" :title="I18nT('host.projectPhp')" :type-flag="'php'" />
      <Service v-else-if="tab === 1" title="PHP" type-flag="php" :fetch-data-when-create="true">
        <template #operation="{ row }">
          <VersionActions :item="row" />
        </template>
      </Service>
      <Manager
        v-else-if="tab === 2"
        type-flag="php"
        :has-static="true"
        url="https://windows.php.net/download/"
        title="PHP"
      ></Manager>
      <Composer
        v-else-if="tab === 3"
        type-flag="composer"
        title="Composer"
        url="https://getcomposer.org/download/"
        :show-port-lib="false"
        :show-brew-lib="true"
        :has-static="true"
      >
      </Composer>
      <Create v-else-if="tab === 4" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '@/components/ServiceManager/base.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'
  import Composer from '../VersionManager/all.vue'
  import Create from './CreateProject.vue'
  import ProjectIndex from '@/components/LanguageProjects/index.vue'
  import VersionActions from './VersionActions.vue'

  const { tab } = AppModuleSetup('php')
  const tabs = [
    I18nT('host.projectPhp'),
    I18nT('base.service'),
    I18nT('base.versionManager'),
    'Composer',
    I18nT('host.newProject')
  ]
</script>
