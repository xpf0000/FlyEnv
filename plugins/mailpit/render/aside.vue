<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === '/mailpit-plugin' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon
          :svg="import('@/svg/mailpit.svg?raw')"
          style="padding: 5px"
          width="28"
          height="28"
        />
      </div>
      <span class="title">Mailpit Plugin</span>
    </div>

    <el-switch
      v-model="serviceRunning"
      :disabled="serviceDisabled"
      @click.stop="stopNav"
      @change="switchChange()"
    />
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup, AppServiceModule } from '@/core/ASide'

  const flag = 'mailpit-plugin' as any
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
  } = AsideSetup(flag)

  ;(AppServiceModule as any)[flag] = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  }
</script>
