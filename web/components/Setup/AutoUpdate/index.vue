<template>
  <div class="plant-title">{{ $t('base.autoUpdate') }}</div>
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
      return store.config.setup.autoCheck
    },
    set(v) {
      store.config.setup.autoCheck = v
    }
  })
</script>
