<template>
  <el-form-item label="Memcached">
    <el-switch v-model="showItem" />
  </el-form-item>
</template>

<script lang="ts" setup>
  import { AppStore } from '@/store/app'
  import { computed } from 'vue'

  const appStore = AppStore()

  const showItem = computed({
    get() {
      return appStore.config.setup.common.showItem?.memcached !== false
    },
    set(v) {
      appStore.config.setup.common.showItem.memcached = v
      appStore.saveConfig()
    }
  })
</script>
