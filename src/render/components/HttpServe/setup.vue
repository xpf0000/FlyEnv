<template>
  <el-form-item label="Http Serve">
    <el-switch v-model="showItem" />
  </el-form-item>
</template>

<script lang="ts" setup>
  import { AppStore } from '@/store/app'
  import { computed } from 'vue'

  const appStore = AppStore()

  const showItem = computed({
    get() {
      return appStore.config.setup.common.showItem?.httpserver !== false
    },
    set(v) {
      appStore.config.setup.common.showItem.httpserver = v
      appStore.saveConfig()
    }
  })
</script>
