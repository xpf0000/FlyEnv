<template>
  <el-form-item label="Tomcat">
    <el-switch v-model="showItem" />
  </el-form-item>
</template>

<script lang="ts" setup>
  import { AppStore } from '@/store/app'
  import { computed } from 'vue'

  const appStore = AppStore()

  const showItem = computed({
    get() {
      return appStore.config.setup.common.showItem?.tomcat !== false
    },
    set(v) {
      appStore.config.setup.common.showItem.tomcat = v
      appStore.saveConfig()
    }
  })
</script>
