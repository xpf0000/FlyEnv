<template>
  <el-form-item label="Java">
    <el-switch v-model="showItem" />
  </el-form-item>
</template>

<script lang="ts" setup>
  import { AppStore } from '@/store/app'
  import { computed } from 'vue'

  const appStore = AppStore()

  const showItem = computed({
    get() {
      return appStore.config.setup.common.showItem?.java !== false
    },
    set(v) {
      appStore.config.setup.common.showItem.java = v
      appStore.saveConfig()
    }
  })
</script>
