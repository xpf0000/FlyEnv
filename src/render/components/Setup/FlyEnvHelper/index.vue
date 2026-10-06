<template>
  <div class="plant-title flex items-center gap-1">
    <span>{{ I18nT('setup.flyenvHelper') }}</span>
    <el-tooltip v-if="isLinux" placement="top">
      <template #content>
        <span class="block max-w-[480px]">{{ I18nT('setup.linuxHelperScope') }}</span>
      </template>
      <yb-icon :svg="import('@/svg/question.svg?raw')" width="12" height="12"></yb-icon>
    </el-tooltip>
  </div>
  <div class="main reset-pass">
    <el-button :loading="fixing" :disabled="fixing" @click.stop="FlyEnvHelperFix.doFix()">{{
      I18nT('setup.flyenvHelperBtn')
    }}</el-button>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { I18nT } from '@lang/index'
  import { FlyEnvHelperFix } from '@/components/Setup/FlyEnvHelper/setup'
  import { FlyEnvHelperSetup } from '@/components/FlyEnvHelper/setup'
  import HelperStore from '@/store/helper'
  const isLinux = window.Server.isLinux
  const fixing = computed(
    () => FlyEnvHelperFix.fixing || FlyEnvHelperSetup.loading || HelperStore.isInstalling()
  )
</script>
