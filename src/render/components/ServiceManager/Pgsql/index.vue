<template>
  <el-popover
    effect="dark"
    popper-class="host-list-poper"
    placement="left-start"
    :show-arrow="false"
    width="auto"
  >
    <ul v-poper-fix class="host-list-menu">
      <Extension :item="item" />
    </ul>
    <template #reference>
      <el-button link class="status">
        <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
      </el-button>
    </template>
  </el-popover>
</template>
<script lang="ts" setup>
  import type { SoftInstalled } from '@/store/brew'
  import Extension from './extension.vue'

  defineProps<{
    item: SoftInstalled
  }>()
</script>
