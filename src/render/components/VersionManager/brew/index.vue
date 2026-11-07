<template>
  <div class="h-full min-h-0 flex flex-col overflow-hidden">
    <el-dialog
      v-model="confirmationVisible"
      :title="I18nT('versionmanager.brewUpgradeConfirm')"
      width="min(600px, 90vw)"
      append-to-body
    >
      <template v-if="preview">
        <p class="mb-4">{{ I18nT('versionmanager.brewUpgradeWarning') }}</p>
        <p class="font-semibold break-all">{{ preview.snapshot.formula }}</p>
        <p class="my-2"
          >{{ preview.snapshot.installedVersions.join(', ') }} →
          {{ preview.snapshot.availableVersion }}</p
        >
        <p v-if="changesSeries" class="text-yellow-600 dark:text-yellow-400 my-2">{{
          I18nT('versionmanager.brewUpgradeSeriesChange')
        }}</p>
        <p class="mt-4">{{ I18nT('versionmanager.brewUpgradeStops') }}</p>
        <ul class="mt-2 list-disc pl-5">
          <li
            v-for="target in preview.targets"
            :key="`${target.module}:${target.item.pid}`"
            class="break-all"
            >{{ target.module }} {{ target.item.version }} — {{ target.item.bin }}</li
          >
          <li v-if="!preview.targets.length">{{
            I18nT('versionmanager.brewUpgradeNoServices')
          }}</li>
        </ul>
      </template>
      <template #footer>
        <el-button @click="confirmationVisible = false">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" :disabled="homebrewUpgrade.busy" @click="confirmUpgrade">{{
          I18nT('versionmanager.brewUpgradeConfirm')
        }}</el-button>
      </template>
    </el-dialog>
    <div
      v-if="homebrewUpgrade.busy || homebrewUpgrade.result"
      class="px-5 py-3 border-b border-gray-200 dark:border-gray-700"
    >
      <div class="flex items-center justify-between gap-3">
        <span>{{ operationStatus }}</span>
        <el-button link @click="showLogs = !showLogs">{{
          I18nT('versionmanager.brewUpgradeLogs')
        }}</el-button>
      </div>
      <pre
        v-if="showLogs"
        class="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs"
        aria-live="polite"
        >{{ homebrewUpgrade.logs
        }}{{
          homebrewUpgrade.error
            ? `
${homebrewUpgrade.error}`
            : ''
        }}</pre>
    </div>
    <template v-if="BrewSetup.installing">
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
              v-if="typeFlag === 'php' && upgradeInfo(scope.row)?.outdated"
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
  import type { BrewUpgradePreview } from '@fork/module/Brew/UpgradeTypes'
  import { I18nT } from '@lang/index'
  import type { AllAppModule } from '@/core/type'
  import { BrewSetup, Setup } from './setup'

  const props = defineProps<{
    typeFlag: AllAppModule
  }>()

  const confirmationVisible = ref(false)
  const preview = ref<BrewUpgradePreview>()
  const showLogs = ref(false)
  const upgradeInfo = (row: { name: string }) =>
    homebrewUpgrade.catalog[row.name.includes('/') ? row.name : `homebrew/core/${row.name}`]
  const changesSeries = computed(() =>
    preview.value?.snapshot.installedVersions.some(
      (version) =>
        version.split('.').slice(0, 2).join('.') !==
        preview.value?.snapshot.availableVersion.split('.').slice(0, 2).join('.')
    )
  )
  const operationStatus = computed(() => {
    if (homebrewUpgrade.result?.postprocessError) return I18nT('versionmanager.brewPackagePartial')
    const phase = homebrewUpgrade.phase
    if (phase === 'succeeded')
      return I18nT(
        homebrewUpgrade.refreshFailed
          ? 'versionmanager.brewUpgradeRefreshFailed'
          : homebrewUpgrade.result?.action === 'upgrade'
            ? 'versionmanager.brewUpgradeSuccess'
            : 'versionmanager.brewPackageSuccess'
      )
    return I18nT(`versionmanager.brewUpgradePhase.${phase}`)
  })
  const openUpgrade = async (row: { name: string }) => {
    try {
      preview.value = await homebrewUpgrade.prepare(row.name)
      confirmationVisible.value = true
    } catch {
      /* controller reports the failure */
    }
  }
  const confirmUpgrade = () => {
    if (!preview.value) return
    confirmationVisible.value = false
    showLogs.value = true
    homebrewUpgrade.confirm(preview.value).catch(() => {})
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
