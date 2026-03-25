<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/rustfs' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon style="padding: 0" :svg="import('@/svg/rustfs.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">RustFS</span>
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
  import { RustfsSetup } from './setup'
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
  } = AsideSetup('rustfs')

  RustfsSetup.init()

  const brewStore = BrewStore()
  const module = brewStore.module('rustfs')
  if (!module?.startExtParam) {
    module.startExtParam = (version: ModuleInstalledItem) => {
      return new Promise<any[]>((resolve) => {
        const dir = join(window.Server.BaseDir!, `rustfs/data`)
        const p = RustfsSetup.dir?.[version.bin] ?? dir
        resolve([p])
      })
    }
  }

  AppServiceModule.rustfs = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
