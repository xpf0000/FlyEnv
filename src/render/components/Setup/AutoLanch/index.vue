<template>
  <div class="plant-title flex items-center gap-1">
    <span>{{ $t('setup.autoLaunch') }}</span>
    <el-popover placement="top" width="auto">
      <template #reference>
        <yb-icon :svg="import('@/svg/question.svg?raw')" width="12" height="12"></yb-icon>
      </template>
      <template #default>
        <span>{{ $t('setup.autoLaunchTips') }}</span>
      </template>
    </el-popover>
  </div>
  <div class="main reset-pass">
    <el-switch v-model="autoLaunch"></el-switch>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@/store/app'

  const { app } = require('@electron/remote')

  const store = AppStore()

  const autoLaunch = computed({
    get() {
      return store.config.setup?.autoLaunch ?? false
    },
    set(v) {
      store.config.setup.autoLaunch = v
      app.setLoginItemSettings({
        openAtLogin: v
      })
      store.saveConfig()
    }
  })

  const sysnAutoLunach = () => {
    const setting = app.getLoginItemSettings()
    console.log('setting: ', setting)
    if (store.config.setup?.autoLaunch !== setting.openAtLogin) {
      store.config.setup.autoLaunch = setting.openAtLogin
    }
  }

  sysnAutoLunach()
</script>
