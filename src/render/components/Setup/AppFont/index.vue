<template>
  <div class="plant-title flex items-center gap-1">
    <span>{{ $t('setup.appFont') }}</span>
    <el-popover placement="top" width="auto">
      <template #reference>
        <yb-icon :svg="import('@/svg/question.svg?raw')" width="12" height="12"></yb-icon>
      </template>
      <template #default>
        <span>{{ $t('setup.appFontTips') }}</span>
      </template>
    </el-popover>
  </div>
  <div class="main brew-src">
    <el-input
      v-model="appFont"
      :placeholder="defaultAppFont"
      clearable
    ></el-input>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@/store/app'

  const defaultAppFont = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

  const store = AppStore()

  const appFont = computed({
    get() {
      return store.config.setup?.appFont ?? ''
    },
    set(v: string) {
      store.config.setup.appFont = v
      store.saveConfig()
    }
  })
</script>
