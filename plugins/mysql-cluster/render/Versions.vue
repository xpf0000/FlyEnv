<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <template v-if="isWindows">
            <span> Mysql </span>
            <el-button class="button" link @click="actions.openURL(mysqlURL)">
              <yb-icon
                style="width: 20px; height: 20px; margin-left: 10px"
                :svg="import('@/svg/http.svg?raw')"
              />
            </el-button>
          </template>
          <template v-else>
            <el-radio-group v-model="source" size="small">
              <el-radio-button value="Homebrew">Homebrew</el-radio-button>
              <el-radio-button v-if="isMacOS" value="Macports">MacPorts</el-radio-button>
            </el-radio-group>
            <el-button v-if="isMacOS" class="button" link @click="actions.openURL(mysqlURL)">
              <yb-icon
                style="width: 20px; height: 20px; margin-left: 10px"
                :svg="import('@/svg/http.svg?raw')"
              />
            </el-button>
          </template>
        </div>
        <el-button class="button" :disabled="managerLoading" link @click="refresh">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': managerLoading }"
          />
        </el-button>
      </div>
    </template>
    <template v-if="showTask">
      <div class="w-full h-full overflow-hidden p-5">
        <div v-if="manager.busy" ref="terminalHost" class="w-full h-full overflow-hidden" />
        <el-scrollbar v-else class="h-full">
          <pre class="whitespace-pre-wrap text-xs">{{ manager.output }}</pre>
        </el-scrollbar>
      </div>
    </template>
    <template v-else-if="unavailable">
      <div class="p-5">
        <pre
          v-if="source === 'Homebrew' && showBrewError"
          class="app-html-block"
          v-html="I18nT('versionmanager.brewErrorTips', { bin: brewBin, error: brewError })"
        />
        <template v-else-if="source === 'Homebrew'">
          <pre class="app-html-block" v-html="I18nT('versionmanager.noBrewFound')" />
          <el-button
            type="primary"
            class="mt-5"
            :disabled="manager.busy"
            @click.stop="manager.installHomebrew()"
            >{{ I18nT('base.install') }}</el-button
          >
        </template>
        <pre v-else class="app-html-block" v-html="I18nT('versionmanager.noPortFound')" />
      </div>
    </template>
    <StaticVersions
      v-else-if="source === 'Static'"
      type-flag="mysql"
      :items="staticRows"
      :fetching="!!manager.fetching.Static"
      @action="staticAction"
    />
    <el-table
      v-else
      height="100%"
      :data="tableData"
      :border="false"
      show-overflow-tooltip
      style="width: 100%"
    >
      <template #empty>
        {{
          manager.fetching[source]
            ? I18nT('base.gettingVersion')
            : I18nT('util.noVerionsFoundInLib')
        }}
      </template>
      <el-table-column prop="name">
        <template #header>
          <span style="padding: 2px 12px 2px 24px; display: block">{{
            I18nT('common.label.library')
          }}</span>
        </template>
        <template #default="scope">
          <el-tooltip :content="actions.fetchCommand(scope.row)" :show-after="600" placement="top">
            <template v-if="source === 'Macports'" #content>
              <pre>{{ actions.fetchCommand(scope.row) }}</pre>
            </template>
            <span
              class="hover:text-yellow-500 cursor-pointer truncate"
              style="padding: 2px 12px 2px 24px"
              @click.stop="actions.copyCommand(scope.row)"
              >{{ scope.row.name }}</span
            >
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column prop="version" :label="I18nT('base.version')" width="200">
        <template #default="scope"
          ><span class="truncate">{{ scope.row.version }}</span></template
        >
      </el-table-column>
      <el-table-column align="center" :label="I18nT('base.isInstalled')" width="120">
        <template #default="scope">
          <div class="cell-status">
            <yb-icon
              v-if="scope.row.installed"
              :svg="import('@/svg/ok.svg?raw')"
              class="installed"
            />
            <el-tooltip
              v-else-if="scope.row.conflictingFormula"
              :content="formulaConflictTips(scope.row)"
              placement="top"
              popper-class="brew-formula-conflict-tooltip"
            >
              <span class="text-yellow-500 cursor-help inline-flex items-center gap-1">
                {{ I18nT('versionmanager.brewFormulaUnavailable') }}
                <yb-icon :svg="import('@/svg/question.svg?raw')" width="12" height="12" />
              </span>
            </el-tooltip>
          </div>
        </template>
      </el-table-column>
      <el-table-column align="center" :label="I18nT('common.label.action')" width="120">
        <template #default="scope">
          <el-button
            type="primary"
            link
            :style="{ opacity: scope.row.version !== undefined ? 1 : 0 }"
            :disabled="manager.busy || !!scope.row.conflictingFormula"
            @click="manager.act(scope.row)"
            >{{
              scope.row.installed ? I18nT('common.action.uninstall') : I18nT('base.install')
            }}</el-button
          >
        </template>
      </el-table-column>
    </el-table>
    <el-alert
      v-if="manager.sourceErrors[source]"
      :title="manager.sourceErrors[source]"
      type="error"
      :closable="false"
    />
    <el-alert v-if="manager.error" :title="manager.error" type="error" :closable="false" />
    <el-alert v-if="manager.warning" :title="manager.warning" type="warning" :closable="false" />
    <template v-if="showTask" #footer>
      <el-button v-if="!manager.busy" type="primary" @click.stop="taskConfirm">{{
        I18nT('base.confirm')
      }}</el-button>
      <el-button v-else @click.stop="manager.cancel()">{{ I18nT('base.cancel') }}</el-button>
    </template>
  </el-card>
</template>
<script setup lang="ts">
  import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
  import { I18nT } from '@lang/index'
  import { AppStore } from '@/store/app'
  import { compareVersions } from '@shared/compare-versions'
  import { versionFixed } from '@/util/Version'
  import { brewFormulaSourceName } from '@/components/VersionManager/brew/FormulaConflict'
  import StaticVersions from '@/components/VersionManager/static/index.vue'
  import type { StaticVersionItem } from '@/components/VersionManager/static/setup'
  import {
    InstallationManager as manager,
    InstallationActionsManager as actions,
    attachInstallationTerminal
  } from './installations'
  import type { InstallationSource, InstallationRow } from './installationsController'

  const appStore = AppStore()
  const isWindows = !!window.Server.isWindows
  const isMacOS = !!window.Server.isMacOS
  const mysqlURL = 'https://dev.mysql.com/downloads/mysql/'
  const source = ref<InstallationSource>(
    manager.taskVisible && manager.current
      ? manager.current.source
      : isWindows
        ? 'Static'
        : window.Server.BrewCellar
          ? 'Homebrew'
          : isMacOS && window.Server.MacPorts
            ? 'Macports'
            : 'Homebrew'
  )
  const unavailable = computed(() => {
    if (!appStore.envIndex && source.value !== 'Static') return true
    return source.value === 'Homebrew'
      ? !window.Server.BrewCellar
      : source.value === 'Macports'
        ? !window.Server.MacPorts
        : false
  })
  const showBrewError = computed(
    () => !!appStore.envIndex && !!window.Server.BrewBin && !!window.Server.BrewError
  )
  const brewBin = computed(() => window.Server.BrewBin ?? '')
  const brewError = computed(() => window.Server.BrewError ?? '')
  const managerLoading = computed(() => !!manager.fetching[source.value] || manager.busy)
  const tableData = computed(() =>
    [...(manager.versions[source.value] ?? [])].sort((a, b) =>
      compareVersions(versionFixed(b.version ?? ''), versionFixed(a.version ?? ''))
    )
  )
  const staticAction = (row: StaticVersionItem) => manager.act({ ...row, source: 'Static' })
  const staticRows = computed(() =>
    (manager.versions.Static ?? []).map((row) => ({
      ...row,
      url: row.url ?? '',
      version: row.version ?? '',
      downing:
        manager.busy && manager.current?.source === 'Static' && manager.current?.name === row.name,
      disabled: manager.busy,
      progress: manager.progress
    }))
  )
  const formulaConflictTips = (row: InstallationRow) =>
    row.conflictingFormula
      ? I18nT('versionmanager.brewFormulaConflict', {
          source: brewFormulaSourceName(row.conflictingFormula)
        })
      : ''
  const showTask = computed(() => manager.taskVisible && manager.current?.source === source.value)
  const taskConfirm = () => manager.confirmTask()
  const terminalHost = ref<HTMLElement>()
  const refresh = () => {
    if (!unavailable.value) manager.load(source.value, true)
  }
  watch(
    [source, unavailable],
    ([value, missing]) => {
      if (!missing) manager.load(value)
    },
    { immediate: true }
  )
  watch(
    () => manager.busy,
    async () => {
      await nextTick()
      attachInstallationTerminal(terminalHost.value)
    }
  )
  watch(showTask, async () => {
    await nextTick()
    attachInstallationTerminal(terminalHost.value)
  })
  onMounted(() => attachInstallationTerminal(terminalHost.value))
  onUnmounted(() => attachInstallationTerminal())
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
