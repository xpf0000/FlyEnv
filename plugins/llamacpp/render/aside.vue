<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === '/llama-cpp' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon :svg="import('@/svg/ai.svg?raw')" class="w-7 h-7" />
      </div>
      <span class="title">llama.cpp</span>
    </div>
    <ServiceSwitch
      v-model="serviceRunning"
      :disabled="serviceDisabled"
      :disabled-tooltip="serviceDisabledTooltip"
      @click.stop="stopNav"
      @change="switchChange()"
    />
  </li>
</template>

<script lang="ts" setup>
  import ServiceSwitch from '@/components/Aside/ServiceSwitch.vue'
  import { AsideSetup, AppServiceModule } from '@/core/ASide'
  import { BrewStore } from '@/store/brew'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import { LlamaCppManager } from './controller'

  const typeFlag = 'llama-cpp'
  const {
    showItem,
    serviceDisabled,
    serviceDisabledTooltip,
    serviceFetching,
    serviceRunning,
    currentPage,
    groupDo,
    switchChange,
    nav,
    stopNav
  } = AsideSetup(typeFlag)

  const module = BrewStore().module(typeFlag)
  module.startExtParam = async (version: ModuleInstalledItem) => {
    return LlamaCppManager.startParameters(version)
  }
  if (!module.stopExtParam) module.stopExtParam = async (_version: ModuleInstalledItem) => []

  AppServiceModule[typeFlag] = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
