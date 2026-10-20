<template>
  <el-card class="version-manager">
    <template #header
      ><div class="card-header"
        ><div class="left"
          ><span>MySQL</span
          ><el-button link :title="t('customDirectories')" @click="actions.customDirectories()"
            ><yb-icon
              :svg="import('@/svg/folder.svg?raw')"
              width="22"
              height="22" /></el-button></div
        ><el-button link :loading="!!actions.operations.refresh" @click="actions.refresh()">{{
          t('refresh')
        }}</el-button></div
      ></template
    >
    <el-scrollbar>
      <el-table :data="versions" show-overflow-tooltip>
        <el-table-column prop="version" :label="t('version')" width="120" />
        <el-table-column :label="t('path')" min-width="250"
          ><template #default="{ row }"
            ><span class="cursor-pointer text-yellow-500" @click="actions.open(row.path)">{{
              row.path
            }}</span
            ><span v-if="row.error" class="ml-2 text-red-500">{{ row.error }}</span></template
          ></el-table-column
        >
        <el-table-column :label="t('mark')" width="180"
          ><template #default="{ row }"
            ><el-input
              v-if="editing === row.bin"
              v-model="note"
              size="small"
              @blur="saveNote(row)"
              @keyup.enter="saveNote(row)"
              @keyup.esc="editing = ''"
            /><span v-else class="cursor-pointer" @dblclick="editNote(row)">{{
              row.note || installedVersionNote(row, 'mysql') || '—'
            }}</span></template
          ></el-table-column
        >
        <el-table-column :label="t('environment')" width="115" align="center"
          ><template #default="{ row }"
            ><el-tag v-if="ServiceActionStore.isInAppEnv(row)" size="small">{{
              t('enabled')
            }}</el-tag
            ><span v-else>—</span></template
          ></el-table-column
        >
        <el-table-column :label="t('references')" min-width="180"
          ><template #default="{ row }">{{ references(row) }}</template></el-table-column
        >
        <el-table-column :label="t('actions')" width="80" fixed="right" align="center"
          ><template #default="{ row }">
            <el-popover
              trigger="click"
              :show-arrow="false"
              popper-class="host-list-poper"
              width="200"
              ><ul class="host-list-menu"
                ><li @click="actions.open(row.path)">{{ t('openDirectory') }}</li
                ><li @click="actions.environment(row)">{{ t('environment') }}</li
                ><li @click="actions.aliases(row)">{{ t('aliases') }}</li
                ><li @click="editNote(row)">{{ t('mark') }}</li
                ><li
                  v-if="isWindows && isManagedPackage(row)"
                  @click="
                    installations.act({
                      ...row,
                      name: 'MySQL ' + row.version,
                      source: 'Static',
                      installed: true
                    })
                  "
                  >{{ t('delete') }}</li
                ></ul
              ><template #reference
                ><el-button link
                  ><yb-icon
                    :svg="import('@/svg/more1.svg?raw')"
                    width="22"
                    height="22" /></el-button></template
            ></el-popover> </template
        ></el-table-column>
      </el-table>
    </el-scrollbar>
  </el-card>
</template>
<script setup lang="ts">
  import { computed, ref, onMounted } from 'vue'
  import { BrewStore } from '@/store/brew'
  import { MysqlClusterManager as manager } from './manager'
  import {
    InstallationActionsManager as actions,
    InstallationManager as installations,
    installedVersionNote,
    ServiceActionStore
  } from './installations'
  import { usesInstallation } from './versionUse'
  import { t } from './lang'
  const versions = computed(() => BrewStore().module('mysql').installed)
  const isWindows = !!window.Server.isWindows
  const editing = ref(''),
    note = ref('')
  const references = (row: any) =>
    manager.catalog.instances
      .filter((i) =>
        usesInstallation(i.engine, { bin: row.bin, path: row.path, version: row.version })
      )
      .map((i) => i.name)
      .join(', ') || '—'
  const isManagedPackage = (row: any) =>
    row.path
      .replace(/\\/g, '/')
      .toLowerCase()
      .startsWith(window.Server.AppDir!.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase() + '/')
  function editNote(row: any) {
    editing.value = row.bin
    note.value = row.note || installedVersionNote(row, 'mysql')
  }
  async function saveNote(row: any) {
    if (editing.value !== row.bin) return
    await actions.note(row, note.value)
    editing.value = ''
  }
  onMounted(() => {
    actions.refresh()
    actions.fetchEnvironment()
  })
</script>
