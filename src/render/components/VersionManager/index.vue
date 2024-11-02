<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> {{ title }} </span>
          <el-button class="button" link @click="openURL(url)">
            <yb-icon
              style="width: 20px; height: 20px; margin-left: 10px"
              :svg="import('@/svg/http.svg?raw')"
            ></yb-icon>
          </el-button>
        </div>
        <el-button class="button" link :disabled="fetching" @click="reGetData">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': fetching }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <el-table height="100%" :data="tableData" :border="false" style="width: 100%">
      <template #empty>
        <template v-if="fetching">
          {{ $t('base.gettingVersion') }}
        </template>
        <template v-else>
          {{ $t('util.noVerionsFoundInLib') }}
        </template>
      </template>
      <el-table-column prop="version" width="200">
        <template #header>
          <span style="padding: 2px 12px 2px 24px; display: block">{{ $t('base.version') }}</span>
        </template>
        <template #default="scope">
          <span style="padding: 2px 12px 2px 24px; display: block">{{
            scope.row?.name ?? scope.row.version
          }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="null">
        <template #default="scope">
          <div class="cell-progress">
            <el-progress v-if="scope.row.downing" :percentage="scope.row.progress"></el-progress>
          </div>
        </template>
      </el-table-column>
      <el-table-column align="center" :label="$t('base.isInstalled')" width="150">
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
      <el-table-column align="center" :label="$t('base.operation')" width="150">
        <template #default="scope">
          <el-button
            type="primary"
            link
            :style="{ opacity: scope.row.version !== undefined ? 1 : 0 }"
            :loading="scope.row.downing"
            :disabled="scope.row.downing"
            @click="handleOnlineVersion(scope.row, scope.row.installed)"
            >{{ scope.row.installed ? $t('base.uninstall') : $t('base.install') }}</el-button
          >
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script lang="ts" setup>
  import type { AllAppModule } from '@/core/type'
  import { Setup } from '@/components/VersionManager/setup'

  const props = defineProps<{
    typeFlag: AllAppModule
    title: string
    url: string
  }>()

  const { openURL, reGetData, fetching, tableData, handleOnlineVersion } = Setup(props.typeFlag)
</script>
