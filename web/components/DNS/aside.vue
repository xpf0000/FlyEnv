<template>
  <li
    v-if="showItem"
    class="non-draggable"
    :class="'non-draggable' + (currentPage === '/dns' ? ' active' : '')"
    @click="doNav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon style="padding: 5px" :svg="import('@/svg/dns2.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">DNS Server</span>
    </div>

    <el-switch
      v-model="serviceRunning"
      :loading="serviceFetching"
      :disabled="serviceFetching"
      @click.stop="stopNav"
      @change="switchChange"
    >
    </el-switch>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup, AppServiceModule } from '@web/core/ASide'
  import { DnsStore } from './dns'
  import { computed } from 'vue'

  const { showItem, serviceDisabled, currentPage, nav, stopNav } = AsideSetup('dns')

  const dnsStore = DnsStore()

  const serviceFetching = computed(() => {
    return dnsStore.fetching
  })

  const serviceRunning = computed(() => {
    return dnsStore.running
  })

  const groupDo = (isRunning: boolean): Array<Promise<string | boolean>> => {
    const all: Array<Promise<string | boolean>> = []
    if (isRunning) {
      if (showItem?.value && serviceRunning?.value) {
        all.push(dnsStore.dnsStop())
      }
    } else {
      if (showItem?.value) {
        all.push(dnsStore.dnsStart())
      }
    }
    return all
  }

  const switchChange = () => {
    let fn = null
    if (serviceFetching?.value) return
    fn = serviceRunning?.value ? dnsStore.dnsStop : dnsStore.dnsStart
    fn().then()
  }

  const doNav = () => {
    nav()
      .then(() => {
        dnsStore.getIP()
      })
      .catch()
  }

  AppServiceModule.dns = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
