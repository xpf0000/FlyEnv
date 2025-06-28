<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/tomcat' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon
          style="padding: 5px"
          :svg="import('@/svg/Tomcat.svg?raw')"
          width="30"
          height="30"
        />
      </div>
      <span class="title">Tomcat</span>
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
  import { TomcatSetup } from '@/components/Tomcat/setup'
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
  } = AsideSetup('tomcat')

  TomcatSetup.init()

  const brewStore = BrewStore()
  const module = brewStore.module('tomcat')
  if (!module?.startExtParam) {
    module.startExtParam = (version: ModuleInstalledItem) => {
      return new Promise<any[]>((resolve) => {
        const v = version.version?.split('.')?.shift() ?? ''
        const dir = join(window.Server.BaseDir!, `tomcat/tomcat${v}`)
        const p = TomcatSetup.CATALINA_BASE?.[version.bin] ?? dir
        resolve([p])
      })
    }
  }

  AppServiceModule.tomcat = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
