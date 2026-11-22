<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === '/hermes' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon
          :svg="import('@/svg/hermes.svg?raw')"
          style="padding: 4px"
          width="28"
          height="28"
        />
      </div>
      <span class="title">Hermes</span>
    </div>
    <ServiceSwitch
      v-model="serviceRunning"
      :disabled="serviceDisabled"
      :disabled-tooltip="serviceDisabledTooltip"
      @click.stop="stopNav"
      @change="switchChange"
    >
    </ServiceSwitch>
  </li>
</template>

<script lang="ts" setup>
  import ServiceSwitch from '@/components/Aside/ServiceSwitch.vue'
  import { AsideSetup } from './ASide'
  import { AppServiceModule } from '@/core/ASide'

  const {
    showItem,
    serviceDisabled,
    serviceDisabledTooltip,
    serviceFetching,
    currentPage,
    groupDo,
    switchChange,
    nav,
    stopNav,
    serviceRunning
  } = AsideSetup()

  AppServiceModule.hermes = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
