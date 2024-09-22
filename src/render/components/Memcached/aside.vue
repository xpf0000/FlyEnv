<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/memcached' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon :svg="import('@/svg/memcached.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">Memcached</span>
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
  } = AsideSetup('memcached')

  AppServiceModule.memcached = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
