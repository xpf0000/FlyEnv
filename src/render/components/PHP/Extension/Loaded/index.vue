<template>
  <el-table v-loading="fetching" height="100%" :data="tableData" style="width: 100%">
    <el-table-column prop="name" class-name="name-cell-td" :label="I18nT('base.name')">
      <template #header>
        <div class="w-full name-cell">
          <span style="display: inline-flex; padding: 2px 0">{{ I18nT('base.name') }}</span>
          <el-input v-model.trim="search" :placeholder="I18nT('base.placeholderSearch')" clearable></el-input>
        </div>
      </template>
      <template #default="scope">
        <div style="padding: 2px 0 2px 24px">{{ scope.row.name }}</div>
      </template>
    </el-table-column>
    <el-table-column align="center" :label="I18nT('base.status')">
      <template #default>
        <div class="cell-status">
          <yb-icon :svg="import('@/svg/ok.svg?raw')" class="installed"></yb-icon>
        </div>
      </template>
    </el-table-column>
  </el-table>
</template>

<script lang="ts" setup>
  import { type SoftInstalled } from '@/store/brew'
  import { Setup } from './setup'
  import { I18nT } from '@lang/index'

  const props = defineProps<{
    version: SoftInstalled
  }>()

  const { tableData, search, fetching } = Setup(props.version)
</script>
