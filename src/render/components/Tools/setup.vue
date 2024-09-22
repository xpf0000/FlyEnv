<template>
  <el-form-item :label="I18nT('base.leftTools')">
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
      return appStore.config.setup.common.showItem?.tools !== false
    },
    set(v) {
      appStore.config.setup.common.showItem.tools = v
      appStore.saveConfig()
    }
  })
</script>
