<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <el-radio-button v-for="(item, index) in tabs" :key="index" :label="item" :value="index" />
    </el-radio-group>
    <div class="main-block">
      <div v-if="tab === 0 || tab === 1" class="flex h-full min-h-0 flex-col gap-2">
        <Service v-if="tab === 0" type-flag="dameng" title="Dameng DM8">
          <template #tool-left>
            <el-button link :title="DamengT('settings')" @click.stop="setupDialog?.open()">
              <yb-icon :svg="import('@/svg/setup.svg?raw')" width="24" height="24" />
            </el-button>
          </template>
          <template #action="{ row }">
            <li
              v-if="!isInitialized(row)"
              :class="{
                'opacity-50 pointer-events-none':
                  DamengManager.state(row)?.busy || DamengManager.state(row)?.unknown
              }"
              @click.stop="setupDialog?.open(row)"
            >
              <yb-icon :svg="import('@/svg/setup.svg?raw')" width="17" height="17" />
              <span class="ml-3">{{
                DamengT(isRecoverable(row) ? 'resumeInitialization' : 'initialize')
              }}</span>
            </li>
            <li @click.stop="infoDialog?.open(row)">
              <yb-icon :svg="import('@/svg/http.svg?raw')" width="17" height="17" />
              <span class="ml-3">{{ DamengT('instanceInfo') }}</span>
            </li>
          </template>
        </Service>
        <Manager
          v-if="tab === 1"
          type-flag="dameng"
          title="Dameng DM8"
          :items="DamengManager.onlineVersions"
          :fetching="DamengManager.fetching"
          url="https://eco.dameng.com/download/"
          @action="versionAction"
          @refresh="DamengManager.fetchOnlineVersions(true)"
        />
      </div>
      <Config v-else-if="tab === 2" />
      <Logs v-else-if="tab === 3" />
    </div>
    <InstallDialog ref="installDialog" />
    <SetupDialog ref="setupDialog" />
    <InfoDialog ref="infoDialog" />
  </div>
</template>

<script lang="ts" setup>
  import { ref, watch } from 'vue'
  import { ElMessageBox } from 'element-plus'
  import { I18nT } from '@lang/index'
  import { AppModuleSetup } from '@/core/Module'
  import Service from '@/components/ServiceManager/index.vue'
  import Manager from '@/components/VersionManager/index.vue'
  import type { StaticVersionItem } from '@/components/VersionManager/static/setup'
  import { DamengManager, type DamengInstalled } from './store'
  import type { DamengVersionItem } from '../shared'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import InstallDialog from './InstallDialog.vue'
  import SetupDialog from './SetupDialog.vue'
  import InfoDialog from './InfoDialog.vue'
  import { DamengT } from './lang'

  const { tab, checkVersion } = AppModuleSetup('dameng')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]
  const installDialog = ref<InstanceType<typeof InstallDialog>>()
  const setupDialog = ref<InstanceType<typeof SetupDialog>>()
  const isInitialized = (row: DamengInstalled) => !!row.damengRuntime?.initialized
  const isRecoverable = (row: DamengInstalled) => !!row.damengRuntime?.initializationCompleted
  const infoDialog = ref<InstanceType<typeof InfoDialog>>()
  watch(tab, (value) => {
    if (value === 1) DamengManager.fetchOnlineVersions(true).catch()
  })

  const versionAction = async (row: StaticVersionItem) => {
    const item = row as DamengVersionItem
    if (item.installed) {
      try {
        await ElMessageBox.confirm(
          DamengT('uninstallConfirm', { version: item.version, path: item.appDir }),
          I18nT('base.attention'),
          {
            confirmButtonText: I18nT('base.confirm'),
            cancelButtonText: I18nT('base.cancel'),
            type: 'warning'
          }
        )
      } catch {
        return
      }
      DamengManager.uninstall(item).catch()
    } else if (item.registrationPending) DamengManager.install(item).catch()
    else installDialog.value?.open(item)
  }

  DamengManager.init().catch()
  DamengManager.fetchOnlineVersions().catch()
  DamengManager.refreshInstalled().catch()
  checkVersion()
</script>
