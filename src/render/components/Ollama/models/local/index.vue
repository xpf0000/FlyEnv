<template>
  <el-table height="100%" :data="tableData" :border="false" style="width: 100%">
    <template #empty>
      <template v-if="fetching">
        {{ I18nT('base.gettingVersion') }}
      </template>
    </template>
    <el-table-column prop="name">
      <template #header>
        <span style="padding: 2px 12px 2px 24px; display: block">{{
          I18nT('base.brewLibrary')
        }}</span>
      </template>
      <template #default="scope">
        <span
          class="hover:text-yellow-500 cursor-pointer truncate"
          style="padding: 2px 12px 2px 24px"
          >{{ scope.row.name }}</span
        >
      </template>
    </el-table-column>
    <el-table-column prop="size" :label="I18nT('ollama.size')" width="150"> </el-table-column>
  </el-table>
</template>

<script lang="ts" setup>
  import { I18nT } from '@shared/lang'
  import { Setup } from './setup'

  const { fetching, tableData } = Setup()
</script>
