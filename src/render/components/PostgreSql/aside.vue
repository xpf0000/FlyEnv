<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/postgresql' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon
          style="padding: 7px"
          :svg="import('@/svg/postgresql.svg?raw')"
          width="30"
          height="30"
        />
      </div>
      <span class="title">PostgreSQL</span>
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
  import { AsideSetup, AppServiceModule } from '@/core/ASide'
  import { PostgreSqlSetup } from './setup'
  import { ServiceActionExtParam } from '@/util/Service'
  import type { AllAppModule } from '@/core/type'
  import type { SoftInstalled } from '@/store/brew'

  const { join } = require('path')

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
  } = AsideSetup('postgresql')

  PostgreSqlSetup.init()

  ServiceActionExtParam['postgresql'] = (
    typeFlag: AllAppModule,
    fn: string,
    version: SoftInstalled
  ) => {
    return new Promise<any[]>((resolve) => {
      if (fn === 'startService') {
        const versionTop = version?.version?.split('.')?.shift() ?? ''
        const dir = join(global.Server.PostgreSqlDir!, `postgresql${versionTop}`)
        const p = PostgreSqlSetup.dir?.[version.bin] ?? dir
        resolve([p])
        return
      }
      return resolve([])
    })
  }

  AppServiceModule.postgresql = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
