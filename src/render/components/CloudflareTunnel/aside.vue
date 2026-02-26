<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/cloudflare-tunnel' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon
          style="padding: 3px"
          :svg="import('@/svg/cloudflare.svg?raw')"
          width="30"
          height="30"
        />
      </div>
      <span class="title">Cloudflare Tunnel</span>
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
  import { AppServiceModule } from '@/core/ASide'
  import { AsideSetup } from './ASide'

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
  } = AsideSetup()

  AppServiceModule['cloudflare-tunnel'] = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
