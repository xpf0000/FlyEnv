<template>
  <el-scrollbar>
    <div class="setup-common">
      <div class="row-2">
        <div class="col">
          <LangeSet />
        </div>
        <div class="col">
          <theme-set />
        </div>
      </div>
      <ProxySet />
      <MacOSSettings v-if="isMacOS" />
      <WindowsSettings v-else-if="isWindows" />
      <LinuxSettings v-else />
    </div>
  </el-scrollbar>
</template>

<script lang="ts" setup>
  import ProxySet from './ProxySet/index.vue'
  import LangeSet from './LangSet/index.vue'
  import { AppStore } from '@/store/app'
  import { computed, watch } from 'vue'
  import ThemeSet from './Theme/index.vue'
  import MacOSSettings from './Common/macOS.vue'
  import WindowsSettings from './Common/Windows.vue'
  import LinuxSettings from './Common/Linux.vue'

  const isMacOS = computed(() => {
    return window.Server.isMacOS
  })
  const isWindows = computed(() => {
    return window.Server.isWindows
  })

  const appStore = AppStore()

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem
  })

  watch(
    showItem,
    () => {
      appStore.saveConfig()
    },
    {
      deep: true
    }
  )
</script>
