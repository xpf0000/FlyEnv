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
    <el-switch
      v-model="serviceRunning"
      :disabled="serviceDisabled"
      @click.stop="stopNav"
      @change="switchChange()"
    />
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup, AppServiceModule } from '@/core/ASide'
  import { BrewStore } from '@/store/brew'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import { LlamaCppManager } from './controller'

  const typeFlag = 'llama-cpp'
  const {
    showItem,
    serviceDisabled,
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
    await LlamaCppManager.init()
    const model = LlamaCppManager.selectedModel
    if (!model) throw new Error('Select a local GGUF model before starting llama.cpp')
    LlamaCppManager.profile.modelPath = model.localPath
    LlamaCppManager.profile.backend = (version.flag ?? 'cpu') as typeof LlamaCppManager.profile.backend
    await LlamaCppManager.saveProfile()
    return [LlamaCppManager.profile, model]
  }
  if (!module.stopExtParam) module.stopExtParam = (_version: ModuleInstalledItem) => []

  AppServiceModule[typeFlag] = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
