<template>
  <div class="plant-title flex items-center gap-1">
    <span>{{ $t('setup.autoStartService') }}</span>
    <el-popover placement="top" width="auto">
      <template #reference>
        <yb-icon :svg="import('@/svg/question.svg?raw')" width="12" height="12"></yb-icon>
      </template>
      <template #default>
        <span>{{ $t('setup.autoStartServiceTips') }}</span>
      </template>
    </el-popover>
  </div>
  <div class="main reset-pass">
    <el-switch v-model="autoStartService"></el-switch>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@/store/app'

  const store = AppStore()

  const autoStartService = computed({
    get() {
      return store.config.setup?.autoStartService ?? false
    },
    set(v) {
      store.config.setup.autoStartService = v
      if (!v) {
        autoHide.value = false
      }
      store.saveConfig()
    }
  })

  const autoHide = computed({
    get() {
      return store.config.setup?.autoHide ?? false
    },
    set(v) {
      store.config.setup.autoHide = v
      store.saveConfig()
    }
  })
</script>
