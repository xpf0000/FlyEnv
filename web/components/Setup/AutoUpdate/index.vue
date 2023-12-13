<template>
  <el-switch v-model="value"></el-switch>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '../../../store/app'
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
