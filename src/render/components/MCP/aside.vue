<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === '/mcp' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon :svg="import('@/svg/mcp.svg?raw')" style="padding: 3px" width="28" height="28" />
      </div>
      <span class="title">MCP Server</span>
    </div>
    <el-switch
      v-model="serviceRunning"
      :disabled="serviceDisabled"
      :loading="serviceFetching"
      @click.stop="stopNav"
      @change="switchChange"
    />
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from './ASide'

  const {
    showItem,
    currentPage,
    serviceDisabled,
    serviceRunning,
    serviceFetching,
    switchChange,
    nav,
    stopNav
  } = AsideSetup()
</script>
