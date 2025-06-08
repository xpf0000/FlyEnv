<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <el-radio-button :label="I18nT('base.add')" :value="0"></el-radio-button>
    </el-radio-group>
    <List ref="list"></List>
  </div>
</template>

<script lang="ts" setup>
  import List from './List.vue'
  import { I18nT } from '@lang/index'
</script>
