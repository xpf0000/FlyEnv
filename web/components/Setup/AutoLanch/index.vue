<template>
  <div class="plant-title flex items-center gap-1">
    <span>{{ $t('setup.autoLunach') }}</span>
    <el-popover placement="top" width="auto">
      <template #reference>
        <yb-icon :svg="import('@/svg/question.svg?raw')" width="12" height="12"></yb-icon>
      </template>
      <template #default>
        <span>{{ $t('setup.autoLunachTips') }}</span>
      </template>
    </el-popover>
  </div>
  <div class="main reset-pass">
    <el-switch v-model="autoLunach"></el-switch>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@web/store/app'

  const store = AppStore()

  const autoLunach = computed({
    get() {
      return store.config.setup?.autoLunach ?? false
    },
    set(v) {
      store.config.setup.autoLunach = v
    }
  })
</script>
