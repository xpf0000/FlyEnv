<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === `/${typeFlag}` ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon style="padding: 6px" :svg="icon()" width="30" height="30" />
      </div>
      <span class="title">{{ title }}</span>
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
  import { reactive } from 'vue'
  import { AsideSetup, AppServiceModule } from '@/core/ASide'
  import { icon, title, typeFlag } from './Module'

  const aside = AsideSetup(typeFlag)
  const { showItem, serviceDisabled, serviceRunning, currentPage, switchChange, nav, stopNav } =
    aside
  AppServiceModule[typeFlag] = reactive({
    showItem,
    serviceDisabled,
    serviceRunning,
    serviceFetching: aside.serviceFetching,
    groupDo: aside.groupDo,
    switchChange
  })
</script>
