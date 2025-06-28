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
  import { AsideSetup, AppServiceModule } from '@/core/ASide'
  import { DnsStore } from './dns'
  import { computed } from 'vue'
  import { passwordCheck } from '@/util/Brew'
  import { BrewStore } from '@/store/brew'

  const { showItem, serviceDisabled, currentPage, nav, stopNav } = AsideSetup('dns')

  const brewStore = BrewStore()
  const dnsStore = DnsStore()

  const module = brewStore.module('dns')
  module.installed.push({} as any)
  module.stop = dnsStore.dnsStop
  module.start = dnsStore.dnsStart

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
    passwordCheck().then(() => {
      let fn = null
      if (serviceFetching?.value) return
      fn = serviceRunning?.value ? dnsStore.dnsStop : dnsStore.dnsStart
      fn().then()
    })
  }

  const doNav = () => {
    nav().then().catch()
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
