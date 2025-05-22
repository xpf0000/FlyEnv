<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === '/meilisearch' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon
          :svg="import('@/svg/meilisearch.svg?raw')"
          style="padding: 5px"
          width="28"
          height="28"
        />
      </div>
      <span class="title">Meilisearch</span>
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
  import { MeiliSearchSetup } from './setup'
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
  } = AsideSetup('meilisearch')

  MeiliSearchSetup.init()

  ServiceActionExtParam['meilisearch'] = (
    typeFlag: AllAppModule,
    fn: string,
    version: SoftInstalled
  ) => {
    return new Promise<any[]>((resolve) => {
      if (fn === 'startService') {
        const dir = join(global.Server.BaseDir!, `meilisearch`)
        const p = MeiliSearchSetup.dir?.[version.bin] ?? dir
        resolve([p])
        return
      }
      return resolve([])
    })
  }

  AppServiceModule.meilisearch = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
