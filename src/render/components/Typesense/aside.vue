<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === '/typesense' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon
          :svg="import('@/svg/typesense.svg?raw')"
          style="padding: 0px"
          width="28"
          height="28"
        />
      </div>
      <span class="title">Typesense</span>
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
  } = AsideSetup('typesense')

  AppServiceModule.typesense = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
