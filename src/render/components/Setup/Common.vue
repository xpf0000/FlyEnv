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
      <template v-if="isMacOS">
        <div class="row-2">
          <div class="col">
            <BrewSrc />
          </div>
          <div class="col">
            <MacPortsSrc />
          </div>
        </div>
      </template>
      <div class="row-2">
        <div class="col">
          <ForceStart />
        </div>
        <div class="col">
          <ShowAI />
        </div>
      </div>
      <div class="row-2">
        <div class="col">
          <Tool />
        </div>
        <div class="col">
          <AutoUpdate />
        </div>
      </div>
      <div class="row-2">
        <div class="col">
          <AutoLanch />
        </div>
        <div class="col">
          <AutoStartService />
        </div>
      </div>
      <div class="row-2">
        <div class="col">
          <AutoHide />
        </div>
        <div v-if="!isWindows" class="col">
          <RestPassword />
        </div>
        <div v-else class="col">
          <TrayStyle />
        </div>
      </div>
      <div v-if="!isWindows" class="row-2">
        <div class="col">
          <TrayStyle />
        </div>
        <div class="col">
          <FlyEnvHelperFix />
        </div>
      </div>
    </div>
  </el-scrollbar>
</template>

<script lang="ts" setup>
  import BrewSrc from './BrewSrc/index.vue'
  import RestPassword from './RestPassword/index.vue'
  import ProxySet from './ProxySet/index.vue'
  import LangeSet from './LangSet/index.vue'
  import AutoUpdate from './AutoUpdate/index.vue'
  import { AppStore } from '@/store/app'
  import { computed, watch } from 'vue'
  import ForceStart from './ForceStart/index.vue'
  import ShowAI from './AI/index.vue'
  import MacPortsSrc from './MacPortsSrc/index.vue'
  import ThemeSet from './Theme/index.vue'
  import Tool from './Tool/index.vue'
  import AutoLanch from './AutoLanch/index.vue'
  import AutoHide from './AutoHide/index.vue'
  import AutoStartService from './AutoStartService/index.vue'
  import FlyEnvHelperFix from '@/components/Setup/FlyEnvHelper/index.vue'
  import TrayStyle from './TrayStyle/index.vue'

  const isMacOS = computed(() => {
    return window.Server.isMacOS
  })
  const isWindows = computed(() => {
    return window.Server.isWindows
  })
  const isLinux = computed(() => {
    return window.Server.isLinux
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
