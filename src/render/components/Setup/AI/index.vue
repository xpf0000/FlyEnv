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
  import { AppStore } from '@/store/app'
  const store = AppStore()
  const value = computed({
    get() {
      return store?.config?.setup?.showAIRobot ?? true
    },
    set(v) {
      store.config.setup.showAIRobot = v
      store.saveConfig()
    }
  })
</script>
<style lang="scss">
  .force-start-plant {
    display: flex;
    align-items: center;
  }
  .force-start-tooltip {
    width: 300px;
    overflow: hidden;
  }
</style>
