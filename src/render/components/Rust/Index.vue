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
        title="Rust"
        type-flag="rust"
        :fetch-data-when-create="true"
      ></Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="rust"
        :has-static="true"
        :show-port-lib="false"
        title="Rust"
        url="https://forge.rust-lang.org/infra/other-installation-methods.html#standalone-installers"
      ></Manager>
      <RustupVM v-else-if="tab === 2" />
      <ProjectIndex
        v-else-if="tab === 3"
        :title="`Rust ${I18nT('base.projects')}`"
        :type-flag="'rust'"
      >
        <template #openin="{ row }">
          <li @click.stop="Project.openPath(row.path, 'RustRover')">
            <yb-icon :svg="import('@/svg/rustrover.svg?raw')" width="13" height="13" />
            <span class="ml-3">{{ I18nT('nodejs.openIN') }} RustMine</span>
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
  import ProjectIndex from '@/components/LanguageProjects/index.vue'
  import { Project } from '@/util/Project'
  import RustupVM from './rustup.vue'

  const { tab } = AppModuleSetup('rust')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    'Rustup',
    `Rust ${I18nT('base.projects')}`
  ]
</script>
