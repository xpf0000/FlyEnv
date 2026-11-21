<template>
  <div class="h-full min-h-0 flex flex-col">
    <UpgradeDialog
      v-model="confirmationVisible"
      :preview="preview"
      :busy="homebrewUpgrade.busy"
      @confirm="confirmUpgrade"
    />
    <el-alert
      v-if="homebrewUpgrade.terminalView !== 'extensions' && catalog?.error"
      :title="I18nT('versionmanager.brewUpgradeCatalogFailed')"
      :description="catalog.error"
      type="warning"
      :closable="false"
    />
    <PackageTerminal v-if="homebrewUpgrade.terminalView === 'extensions'" />
    <el-table
      v-else
      v-loading="fetching"
      height="100%"
      class="flex-1 min-h-0"
      :data="tableData"
      style="width: 100%"
    >
      <el-table-column prop="name" class-name="name-cell-td" :label="I18nT('common.label.name')">
        <template #header>
          <div class="w-full name-cell">
            <span style="display: inline-flex; padding: 2px 0">{{
              I18nT('common.label.name')
            }}</span>
            <el-input
              v-model.trim="search"
              :placeholder="I18nT('common.action.search')"
              clearable
            ></el-input>
          </div>
        </template>
        <template #default="scope">
          <div style="padding: 2px 0 2px 24px">{{ scope.row.name }}</div>
        </template>
      </el-table-column>
      <el-table-column align="center" :label="I18nT('common.label.status')">
        <template #default="scope">
          <div class="cell-status">
            <yb-icon
              v-if="scope.row.status"
              :svg="import('@/svg/ok.svg?raw')"
              class="installed"
            ></yb-icon>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        width="190px"
        align="left"
        :label="I18nT('common.label.action')"
        class-name="operation"
      >
        <template v-if="version?.version" #default="scope">
          <el-button
            v-if="upgradeInfo(scope.row)?.outdated"
            type="primary"
            link
            :disabled="homebrewUpgrade.busy || !upgradeInfo(scope.row)?.eligible"
            @click="openUpgrade(scope.row)"
            >{{ I18nT('versionmanager.brewUpgrade') }}</el-button
          >
          <template v-if="scope.row.status">
            <el-popover :show-after="600" placement="top" width="auto">
              <template #default>
                <span>{{ I18nT('base.copyLink') }}</span>
              </template>
              <template #reference>
                <el-button
                  type="primary"
                  link
                  :icon="Link"
                  @click="copyLink(scope.row)"
                ></el-button>
              </template>
            </el-popover>
            <template v-if="scope.row.name === 'xdebug'">
              <el-popover :show-after="600" placement="top" width="auto">
                <template #default>
                  <span>{{ I18nT('php.copyConfTemplate') }}</span>
                </template>
                <template #reference>
                  <el-button
                    type="primary"
                    link
                    :icon="Document"
                    @click="copyXDebugTmpl(scope.row)"
                  ></el-button>
                </template>
              </el-popover>
            </template>
            <el-popover :show-after="600" placement="top" width="auto">
              <template #default>
                <span>{{ I18nT('common.action.delete') }}</span>
              </template>
              <template #reference>
                <el-button type="primary" link :icon="Delete" @click="doDel(scope.row)"></el-button>
              </template>
            </el-popover>
          </template>
          <template v-else>
            <el-popover :show-after="600" placement="top" width="auto">
              <template #default>
                <span>{{ I18nT('base.install') }}</span>
              </template>
              <template #reference>
                <el-button
                  :disabled="homebrewUpgrade.busy"
                  type="primary"
                  link
                  :icon="Download"
                  @click="handleEdit(scope.row)"
                ></el-button>
              </template>
            </el-popover>
          </template>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { type SoftInstalled } from '@/store/brew'
  import { Setup } from '@/components/PHP/Extension/Homebrew/setup'
  import { homebrewUpgrade } from '@/components/VersionManager/brew/Controller'
  import PackageTerminal from '@/components/VersionManager/brew/PackageTerminal.vue'
  import UpgradeDialog from '@/components/VersionManager/brew/UpgradeDialog.vue'
  import type { BrewUpgradePreview } from '@fork/module/Brew/UpgradeTypes'
  import { I18nT } from '@lang/index'
  import { Link, Document, Download, Delete } from '@element-plus/icons-vue'

  const props = defineProps<{
    version: SoftInstalled
  }>()

  const {
    tableData,
    handleEdit,
    copyLink,
    copyXDebugTmpl,
    search,
    doDel,
    fetching,
    catalog,
    upgrade
  } = Setup(props.version)
  const confirmationVisible = ref(false)
  const preview = ref<BrewUpgradePreview>()
  const copyExtension = ref(false)
  const upgradeInfo = (row: { libName: string }) =>
    catalog.value?.rows[row.libName.includes('/') ? row.libName : `homebrew/core/${row.libName}`]
  const openUpgrade = async (row: { libName: string; status: boolean }) => {
    try {
      preview.value = await homebrewUpgrade.prepare(row.libName, 'php')
      copyExtension.value = row.status
      confirmationVisible.value = true
    } catch {
      /* controller reports the failure */
    }
  }
  const confirmUpgrade = (accepted: BrewUpgradePreview) => upgrade(accepted, copyExtension.value)
</script>
