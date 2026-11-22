<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === `/${typeFlag}` ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon style="padding: 6px" :svg="import('./samwaf.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">{{ title }}</span>
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
  import type { AllAppModule } from '@/core/type'

  const props = withDefaults(
    defineProps<{
      typeFlag?: AllAppModule
      title?: string
    }>(),
    {
      typeFlag: 'samwaf',
      title: 'SamWaf'
    }
  )
  const typeFlag = props.typeFlag

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

  AppServiceModule[typeFlag] = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
