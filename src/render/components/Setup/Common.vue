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
      <div class="row-2">
        <div class="col">
          <BrewSrc />
        </div>
        <div class="col">
          <MacPortsSrc />
        </div>
      </div>
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
          <RestPassword />
        </div>
        <div class="col">
          <AutoLanch />
        </div>
      </div>
      <div class="row-2">
        <div class="col">
          <AutoStartService />
        </div>
        <div class="col">
          <AutoHide />
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
  import Base from '@/core/Base'
  import { I18nT } from '@lang/index'
  import Tool from './Tool/index.vue'
  import { AppModules } from '@/core/App'
  import ModuleShowHide from './ModuleShowHide/index.vue'
  import AutoLanch from './AutoLanch/index.vue'
  import AutoHide from './AutoHide/index.vue'
  import AutoStartService from './AutoStartService/index.vue'

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

  const showAbout = () => {
    Base.Dialog(import('@/components/About/index.vue'))
      .className('about-dialog')
      .title(I18nT('base.about'))
      .width('665px')
      .noFooter()
      .show()
  }
</script>
