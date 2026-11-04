<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === `/${typeFlag}` ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon style="padding: 6px" :svg="import('./mssql.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">{{ title }}</span>
    </div>
    <el-switch
      v-model="serviceRunning"
      :disabled="serviceDisabled"
      @click.stop="stopNav"
      @change="switchChange()"
    />
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup, AppServiceModule } from '@/core/ASide'
  import { BrewStore } from '@/store/brew'
  import type { AllAppModule } from '@/core/type'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import { MssqlManager } from './store'

  const props = withDefaults(
    defineProps<{
      typeFlag?: AllAppModule
      title?: string
    }>(),
    {
      typeFlag: 'mssql',
      title: 'SQL Server'
    }
  )
  const typeFlag = props.typeFlag

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
  } = AsideSetup(typeFlag)

  // Start parameters (sa password / port for Linux first init) ride the
  // existing ModuleInstalledItem lifecycle; no custom start/stop workflow.
  const mssqlModule = BrewStore().module(typeFlag)
  mssqlModule.isOnlyRunOne = !window.Server.isWindows
  const startParams = (item: ModuleInstalledItem) => MssqlManager.startParams(item)
  const stopParams = (item: ModuleInstalledItem) => MssqlManager.stopParams(item)
  if (!mssqlModule.startExtParam) mssqlModule.startExtParam = startParams as any
  if (!mssqlModule.stopExtParam) mssqlModule.stopExtParam = stopParams as any

  AppServiceModule[typeFlag] = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
