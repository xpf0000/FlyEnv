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
      <span class="title">Mysql</span>
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
  import { AsideSetup, AppServiceModule } from '@web/core/ASide'
  import { startService, stopService } from '@web/fn'
  import { AppStore } from '@web/store/app'
  import { MysqlStore } from '@web/components/Mysql/mysql'
  import { computed } from 'vue'

  const {
    showItem,
    serviceDisabled,
    serviceFetching,
    serviceRunning,
    currentPage,
    switchChange,
    nav,
    stopNav,
    currentVersion
  } = AsideSetup('mysql')

  const appStore = AppStore()
  const mysqlStore = MysqlStore()

  const groupRun = computed(() => {
    return mysqlStore.all.some((a) => a.version.running)
  })

  const groupDo = (isRunning: boolean): Array<Promise<string | boolean>> => {
    const all: Array<Promise<string | boolean>> = []
    if (isRunning) {
      if (showItem?.value && serviceRunning?.value && currentVersion?.value?.version) {
        all.push(stopService('mysql', currentVersion?.value))
        if (groupRun?.value) {
          all.push(mysqlStore.groupStop())
        }
      }
    } else {
      if (appStore.phpGroupStart?.[currentVersion?.value?.bin ?? ''] === false) {
        return all
      }
      if (showItem?.value && currentVersion?.value?.version) {
        all.push(startService('mysql', currentVersion?.value))
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
