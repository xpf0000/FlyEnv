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
  import { join } from 'path'
  import { TomcatSetup } from '@/components/Tomcat/setup'
  import { ServiceActionExtParam } from '@/util/Service'
  import { type AllAppModule } from '@/core/type'
  import { type SoftInstalled } from '@/store/brew'

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

  ServiceActionExtParam['tomcat'] = (
    typeFlag: AllAppModule,
    fn: string,
    version: SoftInstalled
  ) => {
    return new Promise<any[]>((resolve) => {
      if (fn === 'startService') {
        const v = version.version?.split('.')?.shift() ?? ''
        const dir = join(global.Server.BaseDir!, `tomcat/tomcat${v}`)
        const p = TomcatSetup.CATALINA_BASE?.[version.bin] ?? dir
        resolve([p])
        return
      }
      return resolve([])
    })
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
