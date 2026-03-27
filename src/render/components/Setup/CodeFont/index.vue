<template>
  <div class="plant-title flex items-center gap-1">
    <span>{{ $t('setup.codeFont') }}</span>
    <el-popover placement="top" width="auto">
      <template #reference>
        <yb-icon :svg="import('@/svg/question.svg?raw')" width="12" height="12"></yb-icon>
      </template>
      <template #default>
        <span>{{ $t('setup.codeFontTips') }}</span>
      </template>
    </el-popover>
  </div>
  <div class="main brew-src">
    <el-input
      v-model="codeFont"
      :placeholder="defaultCodeFont"
      clearable
    ></el-input>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@/store/app'

  const defaultCodeFont = 'Menlo, Monaco, "Courier New", monospace'

  const store = AppStore()

  const codeFont = computed({
    get() {
      return store.config.setup?.codeFont ?? ''
    },
    set(v: string) {
      store.config.setup.codeFont = v
      store.saveConfig()
    }
  })
</script>
