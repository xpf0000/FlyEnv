<template>
  <div class="plant-title flex items-center gap-1">
    <span>{{ I18nT('setup.flyenvHelper') }}</span>
  </div>
  <div class="main reset-pass">
    <el-button
      :loading="FlyEnvHelperFix.fixing"
      :disabled="FlyEnvHelperFix.fixing"
      @click.stop="FlyEnvHelperFix.doFix()"
      >{{ I18nT('setup.flyenvHelperBtn') }}</el-button
    >
  </div>
</template>

<script setup lang="ts">
  import { I18nT } from '@lang/index'
  import { FlyEnvHelperFix } from '@/components/Setup/FlyEnvHelper/setup'
</script>
