<template>
  <template v-if="BrewSetup.installing">
    <div ref="xtermDom" class="w-full h-full overflow-hidden p-5"></div>
  </template>
  <template v-else-if="!checkBrew">
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
  <template v-else>
    <el-table height="100%" :data="tableData" :border="false" style="width: 100%">
      <template #empty>
        <template v-if="currentModule.getListing">
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
      <el-table-column align="center" :label="I18nT('base.operation')" width="120">
        <template #default="scope">
          <el-button
            type="primary"
            link
            :style="{ opacity: scope.row.version !== undefined ? 1 : 0 }"
            :disabled="brewRunning"
            @click="handleBrewVersion(scope.row)"
            >{{ scope.row.installed ? I18nT('base.uninstall') : I18nT('base.install') }}</el-button
          >
        </template>
      </el-table-column>
    </el-table>
  </template>
</template>

<script lang="ts" setup>
  import { I18nT } from '@shared/lang'
  import type { AllAppModule } from '@/core/type'
  import { BrewSetup, Setup } from './setup'

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
    xtermDom,
    brewRunning,
    checkBrew,
    currentModule,
    tableData,
    handleBrewVersion,
    installBrew
  } = Setup(props.typeFlag)
</script>
<style lang="scss">
  .app-html-block {
    a {
      color: #4096ff;
    }
  }
</style>
