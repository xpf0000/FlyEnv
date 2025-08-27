<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === '/consul' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon
          :svg="import('@/svg/consul.svg?raw')"
          style="padding: 5px"
          width="28"
          height="28"
        />
      </div>
      <span class="title">Consul</span>
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
  import { BrewStore } from '@/store/brew'
  import { computed } from 'vue'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import { join } from '@/util/path-browserify'
  import { ConsulSetup } from '@/components/Consul/setup'

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
  } = AsideSetup('consul')

  ConsulSetup.init()

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('consul')
  })

  const module = brewStore.module('consul')
  if (!module?.startExtParam) {
    module.startExtParam = (version: ModuleInstalledItem) => {
      return new Promise<any[]>((resolve) => {
        const versionTop = currentVersion?.value?.version?.split('.')?.shift() ?? ''
        const dir = join(window.Server.BaseDir!, `consul/consul-${versionTop}-data`)
        const p = ConsulSetup.dir?.[version.bin] ?? dir
        resolve([p])
      })
    }
  }

  AppServiceModule.consul = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
