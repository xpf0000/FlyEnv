<template>
  <el-drawer
    v-model="show"
    size="85%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav pl-3 pr-5">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3 truncate">{{ item.version }} - {{ item.path }}</span>
        </div>
      </div>
      <div v-loading="backuping" class="main-wapper p-3">
        <el-card class="h-full version-manager">
          <template #header>
            <div class="card-header">
              <div class="left">
                <el-button :disabled="versionRunning" @click.stop="showAddDatabase">{{
                  I18nT('mysql.addDatabase')
                }}</el-button>
                <el-button :disabled="versionRunning" @click.stop="showRootPassword">{{
                  I18nT('mysql.rootPassword')
                }}</el-button>
                <el-dropdown
                  :disabled="backuping || !selectDatabase || selectDatabase.length === 0"
                  split-button
                  class="ml-3"
                  @click="doBackup"
                >
                  {{ I18nT('mysql.databaseBackup') }}
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item @click.stop="showBackupDirSet">{{
                        I18nT('mysql.backupSaveDirSet')
                      }}</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </div>
          </template>
          <template #default>
            <template v-if="!item.run">
              <el-empty
                :description="
                  I18nT('mysql.mysqlNeedRunTips', {
                    app: item.typeFlag === 'mysql' ? 'MySQL' : 'MariaDB'
                  })
                "
              ></el-empty>
            </template>
            <template v-else>
              <Database ref="databasevm" :item="item" />
            </template>
          </template>
        </el-card>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, watch, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import { MySQLManage } from '@/components/Mysql/Manage/manage'
  import { BrewStore } from '@/store/brew'
  import Database from '@/components/Mysql/Manage/database.vue'
  import { InstallationActionsManager as actions } from './installations'

  const props = defineProps<{ item: ModuleInstalledItem }>()
  const databasevm = ref()
  const versionRunning = computed(() => {
    const module = BrewStore().module('mysql')
    return module.starting || module.installed.some((item) => item.running)
  })
  const selectDatabase = computed(() => databasevm.value?.selectDatabase)
  const backuping = computed(() => MySQLManage.backuping?.[props.item.bin])
  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()
  const doBackup = () => {
    if (backuping.value || !selectDatabase.value?.length) return
    actions.backupDatabases(props.item, selectDatabase.value)
  }
  const showRootPassword = () => actions.managementDialog(props.item, 'setPassword')
  const showAddDatabase = () => actions.managementDialog(props.item, 'addDatabase')
  const showBackupDirSet = () => actions.managementDialog(props.item, 'setBackupDir')
  watch(
    () => props.item.run && !props.item.running,
    (running) => {
      if (running) actions.refreshDatabases(props.item)
    },
    { immediate: true }
  )
  defineExpose({ show, onSubmit, onClosed })
</script>
