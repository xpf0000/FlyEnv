<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> {{ cardHeadTitle }} </span>
          <template v-if="!brewRunning && !showNextBtn">
            <el-select v-model="libSrc" style="margin-left: 8px" class="w-52">
              <el-option
                v-if="showBrewLib !== false"
                :disabled="!checkBrew()"
                value="brew"
                label="Homebrew"
              ></el-option>
              <el-option
                v-if="showPortLib !== false"
                :disabled="!checkPort()"
                value="port"
                label="MacPorts"
              ></el-option>
              <el-option v-if="hasStatic" value="static" :label="`static-${typeFlag}`"></el-option>
            </el-select>
          </template>
        </div>
        <el-button v-if="showNextBtn" type="primary" @click="toNext">{{
          I18nT('base.confirm')
        }}</el-button>
        <el-button
          v-else
          class="button"
          :disabled="fetching || brewRunning"
          link
          @click="reGetData"
        >
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': fetching || brewRunning }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <template v-if="showLog">
      <div class="log-wapper">
        <div ref="logs" class="logs"></div>
      </div>
    </template>
    <el-table v-else height="100%" :data="tableData" :border="false" style="width: 100%">
      <template #empty>
        <template v-if="!checkBrew() && !checkPort() && !['php', 'caddy'].includes(typeFlag)">
          <div class="no-lib-found" v-html="I18nT('util.noLibFound')"></div>
        </template>
        <template v-else-if="currentModule.getListing">
          {{ I18nT('base.gettingVersion') }}
        </template>
        <template v-else>
          {{ I18nT('util.noVerionsFoundInLib') }}
        </template>
      </template>
      <el-table-column prop="name">
        <template #header>
          <span style="padding: 2px 12px 2px 24px; display: block">{{
            I18nT('base.brewLibrary')
          }}</span>
        </template>
        <template #default="scope">
          <span style="padding: 2px 12px 2px 24px; display: block">{{ scope.row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="version" :label="I18nT('base.version')" width="150"> </el-table-column>
      <el-table-column align="center" :label="I18nT('base.isInstalled')" width="120">
        <template #default="scope">
          <div class="cell-status">
            <yb-icon
              v-if="scope.row.installed"
              :svg="import('@/svg/ok.svg?raw')"
              class="installed"
            ></yb-icon>
          </div>
        </template>
      </el-table-column>
      <template v-if="libSrc === 'static'">
        <el-table-column :label="null">
          <template #default="scope">
            <div class="cell-progress">
              <el-progress v-if="scope.row.downing" :percentage="scope.row.progress"></el-progress>
            </div>
          </template>
        </el-table-column>
        <el-table-column align="center" :label="I18nT('base.operation')" width="150">
          <template #default="scope">
            <el-button
              type="primary"
              link
              :style="{ opacity: scope.row.version !== undefined ? 1 : 0 }"
              :loading="scope.row.downing"
              :disabled="scope.row.downing"
              @click="handleOnlineVersion(scope.row, scope.row.installed)"
              >{{
                scope.row.installed ? I18nT('base.uninstall') : I18nT('base.install')
              }}</el-button
            >
          </template>
        </el-table-column>
      </template>
      <template v-else>
        <el-table-column align="center" :label="I18nT('base.operation')" width="120">
          <template #default="scope">
            <el-button
              type="primary"
              link
              :style="{ opacity: scope.row.version !== undefined ? 1 : 0 }"
              :disabled="brewRunning"
              @click="handleBrewPortVersion(scope.row)"
              >{{
                scope.row.installed ? I18nT('base.uninstall') : I18nT('base.install')
              }}</el-button
            >
          </template>
        </el-table-column>
      </template>
    </el-table>
  </el-card>
</template>

<script lang="ts" setup>
  import { I18nT } from '@shared/lang'
  import type { AllAppModule } from '@/core/type'
  import { Setup } from '@/components/VersionManager/setup'

  const props = withDefaults(
    defineProps<{
      typeFlag: AllAppModule
      hasStatic: boolean
      showBrewLib: boolean
      showPortLib: boolean
    }>(),
    {
      hasStatic: false,
      showBrewLib: true,
      showPortLib: true
    }
  )

  const {
    showNextBtn,
    cardHeadTitle,
    brewRunning,
    libSrc,
    checkBrew,
    checkPort,
    toNext,
    currentModule,
    reGetData,
    showLog,
    tableData,
    handleOnlineVersion,
    handleBrewPortVersion,
    fetching,
    logs
  } = Setup(props.typeFlag, props.hasStatic)
</script>
