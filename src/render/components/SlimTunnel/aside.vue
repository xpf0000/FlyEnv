<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/slim-tunnel' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon
          style="padding: 4px"
          :svg="import('@/svg/link.svg?raw')"
          width="30"
          height="30"
        />
      </div>
      <span class="title">Slim Tunnel</span>
    </div>

    <el-switch
      v-model="serviceRunning"
      :disabled="serviceDisabled"
      @click.stop="stopNav"
      @change="switchChange"
    />
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from './ASide'

  const {
    showItem,
    serviceDisabled,
    serviceRunning,
    currentPage,
    switchChange,
    nav,
    stopNav
  } = AsideSetup()
</script>
