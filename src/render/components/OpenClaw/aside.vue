<template>
  <li :class="'non-draggable' + (currentPage === '/openclaw' ? ' active' : '')" @click="nav">
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon
          style="padding: 5px"
          :svg="import('@/svg/openclaw.svg?raw')"
          width="30"
          height="30"
        />
      </div>
      <span class="title">OpenClaw</span>
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

  AppServiceModule.openclaw = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
