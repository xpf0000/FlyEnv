<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === '/cliproxyapi' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon
          :svg="import('@/svg/cliproxyapi.svg?raw')"
          style="padding: 3px"
          width="28"
          height="28"
        />
      </div>
      <span class="title">CLIProxyAPI</span>
    </div>

    <ServiceSwitch
      v-model="serviceRunning"
      :disabled="serviceDisabled"
      :disabled-tooltip="serviceDisabledTooltip"
      @click.stop="stopNav"
      @change="switchChange()"
    >
    </ServiceSwitch>
  </li>
</template>

<script lang="ts" setup>
  import ServiceSwitch from '@/components/Aside/ServiceSwitch.vue'
  import { AsideSetup, AppServiceModule } from '@/core/ASide'

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
  } = AsideSetup('cliproxyapi')

  AppServiceModule.cliproxyapi = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
