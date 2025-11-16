<template>
  <template v-if="PodmanSetup.installing">
    <div class="w-full h-full overflow-hidden p-5">
      <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
    </div>
  </template>
  <template v-else-if="!checkPodman">
    <template v-if="showPodmanError">
      <div class="p-5">
        <pre
          class="app-html-block"
          v-html="I18nT('podman.podmanErrorTips', { bin: podmanBin, error: podmanError })"
        ></pre>
      </div>
    </template>
    <template v-else>
      <div class="p-5">
        <pre class="app-html-block" v-html="I18nT('podman.noPodmanFound')"></pre>
        <el-button
          type="primary"
          class="mt-5"
          :disabled="PodmanSetup.installing"
          @click.stop="installPodman"
          >{{ I18nT('base.install') }}</el-button
        >
      </div>
    </template>
  </template>
  <template v-else>
    <el-table
      height="100%"
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
            I18nT('base.Library')
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
      <el-table-column prop="version" :label="I18nT('base.version')" width="200">
        <template #default="scope">
          <span class="truncate">{{ scope.row.version }}</span>
        </template>
      </el-table-column>
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
      <el-table-column align="center" :label="I18nT('base.action')" width="120">
        <template #default="scope">
          <el-button
            type="primary"
            link
            :style="{ opacity: scope.row.version !== undefined ? 1 : 0 }"
            :disabled="PodmanSetup.installing"
            @click="handlePodmanVersion(scope.row)"
            >{{ scope.row.installed ? I18nT('base.uninstall') : I18nT('base.install') }}</el-button
          >
        </template>
      </el-table-column>
    </el-table>
  </template>
</template>

<script lang="ts" setup>
  import { I18nT } from '@lang/index'
  import type { AllAppModule } from '@/core/type'
  import { PodmanSetup, Setup } from './setup'

  const props = defineProps<{ typeFlag: AllAppModule }>()

  const {
    xtermDom,
    checkPodman,
    fetching,
    tableData,
    handlePodmanVersion,
    installPodman,
    fetchCommand,
    copyCommand,
    showPodmanError,
    podmanError,
    podmanBin
  } = Setup(props.typeFlag)
</script>
<style lang="scss">
  .app-html-block {
    a {
      color: #4096ff;
    }
  }
</style>
