<template>
  <div class="plant-title">{{ $t('base.theme') }}</div>
  <div class="main brew-src">
    <el-select v-model="theme" :placeholder="$t('base.theme')">
      <template v-for="(label, value) in themes" :key="value">
        <el-option :label="label" :value="value"></el-option>
      </template>
    </el-select>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@/store/app'
  import { I18nT } from '@shared/lang'

  const { nativeTheme } = require('@electron/remote')

  const store = AppStore()
  const themes = computed(() => {
    return {
      dark: I18nT('base.themeDark'),
      light: I18nT('base.themeLight'),
      system: I18nT('base.themeAuto')
    }
  })

  const theme = computed({
    get() {
      const t = store?.config?.setup?.theme
      if (!t) {
        return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
      }
      return t
    },
    set(v) {
      store.config.setup.theme = v
      store.saveConfig()
    }
  })
</script>
