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

    <el-switch
      v-model="serviceRunning"
      :disabled="serviceDisabled"
      @click.stop="stopNav"
      @change="switchChange"
    >
    </el-switch>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from './ASide'
  import { OpenClawSetup } from './setup'
  import { AppServiceModule } from '@/core/ASide'

  const {
    showItem,
    serviceDisabled,
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
