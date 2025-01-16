<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, index) in tabs" :key="index">
        <el-radio-button :label="item" :value="index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Versions v-if="tab === 0"></Versions>
      <Config v-if="tab === 1" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Versions from './List.vue'
  import Config from './Config.vue'
  import { AppModuleSetup } from '@/core/Module'

  const { tab } = AppModuleSetup('node')
  const tabs = ['NodeJS', '.npmrc']
</script>
