<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, index) in tabs" :key="index">
        <el-radio-button :label="item" :value="index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <General v-if="tab === 0" />
      <GitService v-else-if="tab === 1 && isWindows" />
      <Manager
        v-else-if="tab === 2 && isWindows"
        type-flag="git"
        title="Git"
        url="https://github.com/git-for-windows/git/releases"
        :has-static="true"
        :show-brew-lib="false"
        :show-port-lib="false"
        :show-sdkman-lib="false"
      />
      <el-card v-else-if="tab === 1 || tab === 2" header="Git Install">
        <el-alert
          title="Use your system package manager to install Git on macOS or Linux. FlyEnv will detect it from PATH after installation."
          type="info"
          show-icon
        />
      </el-card>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Manager from '@/components/VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'
  import General from './General.vue'
  import GitService from './Service.vue'

  const { tab } = AppModuleSetup('git')
  const isWindows = window.Server.isWindows
  const tabs = ['General', I18nT('base.service'), I18nT('base.versionManager')]
</script>
