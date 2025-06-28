<template>
  <li
    v-if="showItem"
    class="non-draggable"
    :class="'non-draggable' + (currentPage === '/ftp-srv' ? ' active' : '')"
    @click="doNav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon style="padding: 5px" :svg="import('@/svg/ftp.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">ftp-srv</span>
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
  import { computed } from 'vue'
  import { AsideSetup, AppServiceModule } from '@/core/ASide'
  import { FtpStore } from './ftp'
  import { BrewStore } from '@/store/brew'

  const { showItem, currentPage, nav, stopNav } = AsideSetup('ftp-srv')

  const brewStore = BrewStore()
  const ftpStore = FtpStore()

  const module = brewStore.module('ftp-srv')
  module.installed.push({} as any)
  module.stop = ftpStore.stop
  module.start = ftpStore.start

  const serviceDisabled = computed(() => {
    return ftpStore.fetching
  })

  const serviceRunning = computed(() => {
    return ftpStore.running
  })

  const serviceFetching = computed(() => {
    return ftpStore.fetching
  })

  const groupDo = (isRunning: boolean): Array<Promise<string | boolean>> => {
    const all: Array<Promise<string | boolean>> = []
    if (isRunning) {
      if (showItem?.value && serviceRunning?.value) {
        all.push(ftpStore.stop())
      }
    } else {
      if (showItem?.value) {
        all.push(ftpStore.start())
      }
    }
    return all
  }

  const switchChange = () => {
    let fn = null
    if (serviceFetching?.value) return
    fn = serviceRunning?.value ? ftpStore.stop : ftpStore.start
    fn().then()
  }

  const doNav = () => {
    nav().then().catch()
  }

  AppServiceModule['ftp-srv'] = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
