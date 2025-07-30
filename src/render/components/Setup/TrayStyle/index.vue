<template>
  <div class="plant-title flex items-center gap-1">
    <span>{{ $t('tray.trayMenuBarStyle') }}</span>
    <el-popover placement="top" width="auto">
      <template #reference>
        <yb-icon :svg="import('@/svg/question.svg?raw')" width="12" height="12"></yb-icon>
      </template>
      <template #default>
        <span>{{ $t('tray.trayMenuBarStyleTips') }}</span>
      </template>
    </el-popover>
  </div>
  <div class="main reset-pass">
    <el-radio-group v-model="style">
      <el-radio-button :label="I18nT('tray.classic')" value="classic"></el-radio-button>
      <el-radio-button :label="I18nT('tray.modern')" value="modern"></el-radio-button>
    </el-radio-group>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@/store/app'
  import { I18nT } from '@lang/index'

  const store = AppStore()

  const style = computed({
    get() {
      return store.config.setup?.trayMenuBarStyle ?? 'modern'
    },
    set(v: 'modern' | 'classic') {
      store.config.setup.trayMenuBarStyle = v
      store.saveConfig()
    }
  })
</script>
