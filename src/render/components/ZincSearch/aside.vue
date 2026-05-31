<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === '/zincsearch' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon
          :svg="import('@/svg/zincsearch.svg?raw')"
          style="padding: 4px"
          width="28"
          height="28"
        />
      </div>
      <span class="title">ZincSearch</span>
    </div>

    <el-switch
      v-model="serviceRunning"
      :disabled="serviceDisabled"
      @click.stop="stopNav"
      @change="switchChange()"
    >
    </el-switch>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup, AppServiceModule } from '@/core/ASide'

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
  } = AsideSetup('zincsearch')

  AppServiceModule.zincsearch = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
