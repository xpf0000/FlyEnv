<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, index) in tabs" :key="index">
        <el-radio-button :label="item" :value="index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0"></Service>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from './Service.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'

  const { tab } = AppModuleSetup('ftp-srv')
  const tabs = [I18nT('base.service')]
</script>
