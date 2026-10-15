<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, index) in tabs" :key="index">
        <el-radio-button :label="item" :value="index" />
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="mssql" title="SQL Server">
        <template #tool-left>
          <el-button class="button" link @click.stop="openSettings">
            <yb-icon
              style="width: 20px; height: 20px; margin-left: 10px"
              :svg="import('@/svg/setup.svg?raw')"
            ></yb-icon>
          </el-button>
        </template>
      </Service>
      <div v-else-if="tab === 1" class="flex h-full min-h-0 flex-col gap-2">
        <el-alert type="info" :closable="false" :title="MssqlT('developerEditionNote')" />
        <el-alert
          v-if="!isWindows"
          type="info"
          :closable="false"
          :title="MssqlT('linuxRuntimeNotice')"
        />
        <Manager
          type-flag="mssql"
          title="SQL Server"
          :items="MssqlManager.onlineVersions"
          :fetching="MssqlManager.fetching"
          url="https://learn.microsoft.com/sql/sql-server/"
          @action="onVersionAction"
          @refresh="MssqlManager.fetchOnlineVersions(true)"
        />
      </div>
      <Logs v-else-if="tab === 2" />
    </div>
    <SetupDialog
      ref="setupDialog"
      :with-eula="dialogWithEula"
      :item="pendingItem"
      @confirm="onDialogConfirm"
    />
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { ElMessageBox } from 'element-plus'
  import { I18nT } from '@lang/index'
  import { AppModuleSetup } from '@/core/Module'
  import { BrewStore } from '@/store/brew'
  import Service from '@/components/ServiceManager/index.vue'
  import Manager from '@/components/VersionManager/index.vue'
  import Logs from './Logs.vue'
  import SetupDialog from './SetupDialog.vue'
  import { MssqlManager, type MssqlVersionItem } from './store'
  import { MssqlT } from './lang'
  import type { StaticVersionItem } from '@/components/VersionManager/static/setup'

  const { tab, checkVersion } = AppModuleSetup('mssql')
  const tabs = [I18nT('base.service'), I18nT('base.versionManager'), I18nT('base.log')]

  MssqlManager.init().catch()
  MssqlManager.fetchOnlineVersions().catch()

  // No current version lands the user on the version-manager tab, whose
  // installed flags are synced from this list; never wait for a manual refresh.
  const mssqlModule = BrewStore().module('mssql')
  if (!mssqlModule.installedFetched) {
    mssqlModule.fetchInstalled(true).catch()
  }

  const isWindows = computed(() => window.Server.isWindows)

  const setupDialog = ref()
  const dialogWithEula = ref(true)
  const pendingItem = ref<MssqlVersionItem | undefined>(undefined)

  const openSettings = () => {
    pendingItem.value = undefined
    dialogWithEula.value = false
    setupDialog.value?.open()
  }

  const onVersionAction = async (row: StaticVersionItem) => {
    const item = row as MssqlVersionItem
    if (item.installed) {
      // Linux only: remove the unpacked directory after confirmation.
      try {
        await ElMessageBox.confirm(
          MssqlT('uninstallConfirm', { version: item.version, path: item.appDir }),
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
      await MssqlManager.uninstall(item)
      return
    }
    await MssqlManager.init()
    const needEula = !MssqlManager.settings.eulaAccepted
    const needPassword = !isWindows.value && !MssqlManager.settings.saPassword
    const developer = JSON.parse(item.note || '{}').edition === 'Developer'
    if (needEula || needPassword || developer) {
      pendingItem.value = item
      dialogWithEula.value = needEula
      setupDialog.value?.open()
      return
    }
    MssqlManager.install(item).catch()
  }

  const onDialogConfirm = () => {
    const item = pendingItem.value
    pendingItem.value = undefined
    if (item) {
      MssqlManager.install(item).catch()
    }
  }

  checkVersion()
</script>
