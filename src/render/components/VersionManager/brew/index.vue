<template>
  <div class="h-full min-h-0 flex flex-col overflow-hidden">
    <UpgradeDialog
      v-model="confirmationVisible"
      :preview="preview"
      :busy="homebrewUpgrade.busy"
      :warn-php-series="typeFlag === 'php'"
      @confirm="confirmUpgrade"
    />
    <el-alert
      v-if="homebrewUpgrade.terminalView !== 'versions' && catalog?.error"
      :title="I18nT('versionmanager.brewUpgradeCatalogFailed')"
      :description="catalog?.error"
      type="warning"
      :closable="false"
      show-icon
    />
    <!-- The global package terminal takes the list's place for this operation. -->
    <PackageTerminal v-if="homebrewUpgrade.terminalView === 'versions'" />
    <template v-else-if="BrewSetup.installing">
      <div class="w-full h-full overflow-hidden p-5">
        <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
      </div>
    </template>
    <template v-else-if="!checkBrew">
      <template v-if="showBrewError">
        <div class="p-5">
          <pre
            class="app-html-block"
            v-html="I18nT('versionmanager.brewErrorTips', { bin: brewBin, error: brewError })"
          ></pre>
        </div>
      </template>
      <template v-else>
        <div class="p-5">
          <pre class="app-html-block" v-html="I18nT('versionmanager.noBrewFound')"></pre>
          <el-button
            type="primary"
            class="mt-5"
            :disabled="BrewSetup.installing"
            @click.stop="installBrew"
            >{{ I18nT('base.install') }}</el-button
          >
        </div>
      </template>
    </template>
    <template v-else>
      <el-table
        height="100%"
        class="flex-1 min-h-0"
        :data="tableData"
        :border="false"
        show-overflow-tooltip
        style="width: 100%"
      >
        <template #empty>
          <template v-if="fetching">
            {{ I18nT('base.gettingVersion') }}
          </template>
          <template v-else>
            {{ I18nT('util.noVerionsFoundInLib') }}
          </template>
        </template>
        <el-table-column prop="name">
          <template #header>
            <span style="padding: 2px 12px 2px 24px; display: block">{{
              I18nT('common.label.library')
            }}</span>
          </template>
          <template #default="scope">
            <el-tooltip :content="fetchCommand(scope.row)" :show-after="600" placement="top">
              <span
                class="hover:text-yellow-500 cursor-pointer truncate"
                style="padding: 2px 12px 2px 24px"
                @click.stop="copyCommand(scope.row)"
                >{{ scope.row.name }}</span
              >
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column
          prop="version"
          :label="I18nT('versionmanager.brewAvailableVersion')"
          width="150"
        >
          <template #default="scope">
            <span class="truncate">{{ scope.row.version }}</span>
          </template>
        </el-table-column>
        <el-table-column align="center" :label="I18nT('base.isInstalled')" width="170">
          <template #default="scope">
            <div class="cell-status">
              <span v-if="upgradeInfo(scope.row)?.installedVersions.length" class="break-all">
                {{ upgradeInfo(scope.row)?.installedVersions.join(', ') }}
                <small v-if="upgradeInfo(scope.row)?.reason" class="block text-gray-500">{{
                  I18nT(`versionmanager.brewUpgradeReason.${upgradeInfo(scope.row)?.reason}`)
                }}</small>
              </span>
              <yb-icon
                v-else-if="scope.row.installed"
                :svg="import('@/svg/ok.svg?raw')"
                class="installed"
              ></yb-icon>
              <el-tooltip
                v-else-if="scope.row.conflictingFormula"
                :content="formulaConflictTips(scope.row)"
                placement="top"
                popper-class="brew-formula-conflict-tooltip"
              >
                <span class="text-yellow-500 cursor-help inline-flex items-center gap-1">
                  {{ I18nT('versionmanager.brewFormulaUnavailable') }}
                  <yb-icon :svg="import('@/svg/question.svg?raw')" width="12" height="12"></yb-icon>
                </span>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
        <el-table-column align="center" :label="I18nT('common.label.action')" width="170">
          <template #default="scope">
            <el-button
              v-if="upgradeInfo(scope.row)?.outdated"
              type="primary"
              link
              :disabled="
                BrewSetup.installing || homebrewUpgrade.busy || !upgradeInfo(scope.row)?.eligible
              "
              @click="openUpgrade(scope.row)"
              >{{ I18nT('versionmanager.brewUpgrade') }}</el-button
            >
            <el-button
              type="primary"
              link
              :style="{ opacity: scope.row.version !== undefined ? 1 : 0 }"
              :disabled="
                BrewSetup.installing || homebrewUpgrade.busy || !!scope.row.conflictingFormula
              "
              @click="handleBrewVersion(scope.row)"
              >{{
                scope.row.installed ? I18nT('common.action.uninstall') : I18nT('base.install')
              }}</el-button
            >
          </template>
        </el-table-column>
      </el-table>
    </template>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { homebrewUpgrade } from './Controller'
  import PackageTerminal from './PackageTerminal.vue'
  import UpgradeDialog from './UpgradeDialog.vue'
  import type { BrewUpgradePreview } from '@fork/module/Brew/UpgradeTypes'
  import { I18nT } from '@lang/index'
  import type { AllAppModule } from '@/core/type'
  import { BrewSetup, Setup } from './setup'

  const props = defineProps<{
    typeFlag: AllAppModule
  }>()

  const confirmationVisible = ref(false)
  const preview = ref<BrewUpgradePreview>()
  const catalog = computed(() => homebrewUpgrade.catalogs[props.typeFlag])
  const upgradeInfo = (row: { name: string }) =>
    catalog.value?.rows[row.name.includes('/') ? row.name : `homebrew/core/${row.name}`]
  const openUpgrade = async (row: { name: string }) => {
    try {
      preview.value = await homebrewUpgrade.prepare(row.name, props.typeFlag)
      confirmationVisible.value = true
    } catch {
      /* controller reports the failure */
    }
  }
  const confirmUpgrade = (accepted: BrewUpgradePreview) => {
    homebrewUpgrade.confirm(accepted).catch(() => {})
  }

  const {
    xtermDom,
    checkBrew,
    fetching,
    tableData,
    handleBrewVersion,
    installBrew,
    fetchCommand,
    copyCommand,
    formulaConflictTips,
    showBrewError,
    brewError,
    brewBin
  } = Setup(props.typeFlag)
</script>
<style lang="scss">
  .app-html-block {
    a {
      color: #4096ff;
    }
  }

  .brew-formula-conflict-tooltip {
    max-width: 245px;
    font-size: 12px !important;
    line-height: 18px;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }
</style>
