<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, index) in tabs" :key="index">
        <el-radio-button :label="item" :value="index" />
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="samwaf" title="SamWaf">
        <template #tool-left>
          <AdminPanel :version="runningVersion" />
        </template>
      </Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="samwaf"
        title="SamWaf"
        :has-static="true"
        :show-brew-lib="false"
        :show-port-lib="false"
        url="https://github.com/samwafgo/SamWaf/releases"
      />
      <Config v-else-if="tab === 2" />
      <Logs v-else-if="tab === 3" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { I18nT } from '@lang/index'
  import { AppModuleSetup } from '@/core/Module'
  import { BrewStore } from '@/store/brew'
  import Service from '@/components/ServiceManager/index.vue'
  import Manager from '@/components/VersionManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import AdminPanel from './AdminPanel.vue'

  const { tab, checkVersion } = AppModuleSetup('samwaf')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]

  const samwafModule = BrewStore().module('samwaf')
  if (!samwafModule.installedFetched) {
    samwafModule.fetchInstalled(true).catch()
  }

  const runningVersion = computed(() => {
    return samwafModule.installed.find((item) => item.run)
  })

  checkVersion()
</script>
