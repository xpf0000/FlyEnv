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
  import { app } from '@/util/NodeFn'
  import { MessageError } from '@/util/Element'

  const isMacOS = computed(() => {
    return window.Server.isMacOS
  })
  const isWindows = computed(() => {
    return window.Server.isWindows
  })
  const isLinux = computed(() => {
    return window.Server.isLinux
  })

  const store = AppStore()

  const autoLaunch = computed({
    get() {
      return store.config.setup?.autoLaunch ?? false
    },
    set(v) {
      app
        .setLoginItemSettings({
          openAtLogin: v
        })
        .then((res: any) => {
          if (typeof res === 'boolean' && res === true) {
            store.config.setup.autoLaunch = v
            store.saveConfig()
          } else {
            MessageError(res)
          }
        })
    }
  })

  const sysnAutoLunach = async () => {
    const setting: any = await app.getLoginItemSettings()
    console.log('setting: ', setting)
    if (store.config.setup?.autoLaunch !== setting.openAtLogin) {
      store.config.setup.autoLaunch = setting.openAtLogin
    }
  }

  if (isMacOS.value) {
    sysnAutoLunach().catch()
  }
</script>
