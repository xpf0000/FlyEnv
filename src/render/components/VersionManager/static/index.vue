<template>
  <el-table height="100%" :data="tableData" :border="false" style="width: 100%">
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
        <span style="padding: 2px 12px 2px 24px; display: block">{{ I18nT('base.Library') }}</span>
      </template>
      <template #default="scope">
        <el-tooltip :show-after="600" placement="top">
          <template #content>
            <pre v-html="fetchCommand(scope.row)"></pre>
          </template>
          <template #default>
            <div
              style="padding: 2px 12px 2px 24px"
              class="flex items-center overflow-hidden hover:text-yellow-500 cursor-pointer gap-2"
              @click.stop="copyCommand(scope.row)"
            >
              <yb-icon :svg="import('@/svg/link.svg?raw')" width="18" height="18" />
              <span class="truncate">
                {{ scope.row.name }}
              </span>
            </div>
          </template>
        </el-tooltip>
      </template>
    </el-table-column>
    <el-table-column :label="null">
      <template #default="scope">
        <div class="cell-progress">
          <el-progress v-if="scope.row.downing" :percentage="scope.row.progress"></el-progress>
        </div>
      </template>
    </el-table-column>
    <el-table-column prop="version" :label="I18nT('base.version')" width="200"> </el-table-column>
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
          :loading="scope.row.downing"
          :disabled="scope.row.downing"
          @click="handleVersion(scope.row)"
          >{{ scope.row.installed ? I18nT('base.uninstall') : I18nT('base.install') }}</el-button
        >
      </template>
    </el-table-column>
  </el-table>
</template>

<script lang="ts" setup>
  import { I18nT } from '@lang/index'
  import type { AllAppModule } from '@/core/type'
  import { Setup } from './setup'

  const props = defineProps<{
    typeFlag: AllAppModule
  }>()

  const { fetching, tableData, handleVersion, fetchCommand, copyCommand } = Setup(props.typeFlag)
</script>
<style lang="scss">
  .app-html-block {
    a {
      color: #4096ff;
    }
  }
</style>
