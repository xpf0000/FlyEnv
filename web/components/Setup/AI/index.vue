<template>
  <div class="plant-title force-start-plant">
    <span>{{ $t('util.showAIRobot') }}</span>
  </div>
  <div class="main reset-pass">
    <el-switch v-model="value"></el-switch>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@web/store/app'
  const store = AppStore()
  const value = computed({
    get() {
      return store?.config?.setup?.showAIRobot ?? true
    },
    set(v) {
      store.config.setup.showAIRobot = v
    }
  })
</script>
