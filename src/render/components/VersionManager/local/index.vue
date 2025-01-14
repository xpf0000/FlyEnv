<template>
  <el-table
    class="service-table"
    height="100%"
    :data="tableData"
    :border="false"
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
    <el-table-column prop="version" width="200">
      <template #header>
        <span style="padding: 2px 12px 2px 24px; display: block">{{ I18nT('base.version') }}</span>
      </template>
      <template #default="scope">
        <span
          :class="{
            current: checkEnvPath(scope.row)
          }"
          style="padding: 2px 12px 2px 24px; display: block"
          >{{ scope.row.version }}</span
        >
      </template>
    </el-table-column>
    <el-table-column :label="I18nT('base.path')">
      <template #default="scope">
        <template v-if="scope.row?.path">
          <span
            class="path"
            :class="{
              current: checkEnvPath(scope.row)
            }"
            @click.stop="openDir(scope.row.path)"
            >{{ scope.row.path }}</span
          >
        </template>
        <template v-else>
          <div class="cell-progress">
            <el-progress v-if="scope.row.downing" :percentage="scope.row.progress"></el-progress>
          </div>
        </template>
      </template>
    </el-table-column>
    <el-table-column align="center" :label="I18nT('base.isInstalled')" width="150">
      <template #default="scope">
        <div class="cell-status">
          <template v-if="scope.row.installed || scope.row?.path">
            <yb-icon :svg="import('@/svg/ok.svg?raw')" class="installed"></yb-icon>
          </template>
        </div>
      </template>
    </el-table-column>
    <el-table-column align="center" :label="I18nT('base.operation')" width="150">
      <template #default="scope">
        <ExtSet :item="scope.row" :type="typeFlag" />
      </template>
    </el-table-column>
  </el-table>
</template>

<script lang="ts" setup>
  import { I18nT } from '@shared/lang'
  import ExtSet from '@/components/ServiceManager/EXT/index.vue'
  import { SetupAll } from './setup'
  import type { AllAppModule } from '@/core/type'
  import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'

  const props = defineProps<{
    typeFlag: AllAppModule
  }>()

  const { fetching, tableData, checkEnvPath, openDir } = SetupAll(props.typeFlag)
  ServiceActionStore.fetchPath()
</script>
