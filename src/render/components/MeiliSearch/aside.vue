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
  import { computed } from 'vue'
  import { AsideSetup, AppServiceModule } from '@/core/ASide'
  import { MeiliSearchSetup } from './setup'
  import { BrewStore } from '@/store/brew'
  import { join } from '@/util/path-browserify'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'

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

  const brewStore = BrewStore()
  const currentVersion = computed(() => {
    return brewStore.currentVersion('meilisearch')
  })

  const module = brewStore.module('meilisearch')
  if (!module?.startExtParam) {
    module.startExtParam = (version: ModuleInstalledItem) => {
      return new Promise<any[]>((resolve) => {
        const v = currentVersion?.value?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
        const dir = join(window.Server.BaseDir!, `meilisearch`, v)
        const p = MeiliSearchSetup.dir?.[version.bin] ?? dir
        resolve([p])
      })
    }
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
