<template>
  <el-form-item :label="I18nT('base.leftHosts')">
    <el-switch v-model="showItem" />
  </el-form-item>
</template>

<script lang="ts" setup>
  import { AppStore } from '@/store/app'
  import { computed } from 'vue'
  import { I18nT } from '@shared/lang'

  const appStore = AppStore()

  const showItem = computed({
    get() {
      return appStore.config.setup.common.showItem?.hosts !== false
    },
    set(v) {
      appStore.config.setup.common.showItem.hosts = v
      appStore.saveConfig()
    }
  })
</script>
