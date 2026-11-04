<template>
  <div class="h-full flex flex-col gap-3">
    <el-alert v-if="error" type="error" :closable="false" :title="error" />
    <el-table
      v-loading="fetching"
      height="100%"
      :data="tableData"
      style="width: 100%"
      class="flex-1 min-h-0"
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
        <template #default>
          <div class="cell-status">
            <yb-icon :svg="import('@/svg/ok.svg?raw')" class="installed"></yb-icon>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script lang="ts" setup>
  import { type SoftInstalled } from '@/store/brew'
  import { Setup } from './setup'
  import { I18nT } from '@lang/index'

  const props = defineProps<{
    version: SoftInstalled
  }>()

  const { tableData, search, fetching, error } = Setup(() => props.version)
</script>
