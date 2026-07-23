<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === '/temporal' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon
          :svg="import('@/svg/temporal.svg?raw')"
          style="padding: 5px"
          width="28"
          height="28"
        />
      </div>
      <span class="title">Temporal</span>
    </div>

    <el-switch
      v-model="serviceRunning"
      :disabled="serviceDisabled"
      @click.stop="stopNav"
      @change="switchChange()"
    >
    </el-switch>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup, AppServiceModule } from '@/core/ASide'
  import { BrewStore } from '@/store/brew'
  import { TemporalSetup } from '@/components/Temporal/setup'

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
  } = AsideSetup('temporal')

  TemporalSetup.init()

  const brewStore = BrewStore()

  const module = brewStore.module('temporal')
  if (!module?.startExtParam) {
    module.startExtParam = () => {
      return new Promise<any[]>((resolve) => {
        resolve([TemporalSetup.uiEnabled ? '1' : '0'])
      })
    }
  }

  AppServiceModule.temporal = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
