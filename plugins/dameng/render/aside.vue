<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === `/${typeFlag}` ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon style="padding: 6px" :svg="import('./dameng.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">{{ title }}</span>
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
  import type { AllAppModule } from '@/core/type'
  import { DamengManager } from './store'

  const props = withDefaults(defineProps<{ typeFlag?: AllAppModule; title?: string }>(), {
    typeFlag: 'dameng',
    title: 'Dameng DM8'
  })
  const typeFlag = props.typeFlag
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
  module.isOnlyRunOne = true
  if (!module.startExtParam) module.startExtParam = DamengManager.startParams as any
  if (!module.stopExtParam) module.stopExtParam = DamengManager.stopParams as any
  AppServiceModule[typeFlag] = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
