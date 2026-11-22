<template>
  <li
    v-if="showItem"
    class="non-draggable"
    :class="'non-draggable' + (currentPage === '/mariadb' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon :svg="import('@/svg/mariaDB.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">MariaDB</span>
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
  } = AsideSetup('mariadb')

  AppServiceModule.mariadb = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
