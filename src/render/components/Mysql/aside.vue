<template>
  <li
    v-if="showItem"
    class="non-draggable"
    :class="'non-draggable' + (currentPage === '/mysql' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon :svg="import('@/svg/mysql.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">MySQL</span>
    </div>

    <ServiceSwitch
      v-model="serviceRunning"
      :disabled="serviceDisabled"
      :disabled-tooltip="serviceDisabledTooltip"
      @click.stop="stopNav"
      @change="switchChange()"
    >
    </ServiceSwitch>
  </li>
</template>

<script lang="ts" setup>
  import ServiceSwitch from '@/components/Aside/ServiceSwitch.vue'
  import { AsideSetup, AppServiceModule } from '@/core/ASide'
  import { MysqlStore } from '@/components/Mysql/mysql'
  import { computed } from 'vue'
  import { BrewStore } from '@/store/brew'

  const {
    showItem,
    serviceDisabled,
    serviceDisabledTooltip,
    serviceFetching,
    serviceRunning,
    currentPage,
    switchChange,
    nav,
    stopNav,
    currentVersion
  } = AsideSetup('mysql')

  const brewStore = BrewStore()
  const mysqlStore = MysqlStore()

  const groupRun = computed(() => {
    return mysqlStore.all.some((a) => a.version.running)
  })

  const groupDo = (isRunning: boolean): Array<Promise<string | boolean>> => {
    const all: Array<Promise<string | boolean>> = []
    if (isRunning) {
      if (showItem?.value && serviceRunning?.value && currentVersion?.value?.version) {
        const module = brewStore.module('mysql')
        all.push(module.stop())
        if (groupRun?.value) {
          all.push(mysqlStore.groupStop())
        }
      }
    } else {
      if (showItem?.value && currentVersion?.value?.version) {
        const module = brewStore.module('mysql')
        all.push(module.start())
        if (!groupRun?.value) {
          all.push(mysqlStore.groupStart())
        }
      }
    }
    return all
  }

  AppServiceModule.mysql = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
