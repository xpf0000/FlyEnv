<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/neo4j' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon style="padding: 5px" :svg="import('@/svg/neo4j.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">Neo4j</span>
    </div>
    <el-switch
      v-model="serviceRunning"
      :disabled="serviceDisabled"
      @click.stop="stopNav"
      @change="switchChange"
    />
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup, AppServiceModule } from '@/core/ASide'
  import { BrewStore, type SoftInstalled } from '@/store/brew'
  import { Neo4jStore } from './store'

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
  } = AsideSetup('neo4j')

  const neo4jModule = BrewStore().module('neo4j')
  const neo4jStore = Neo4jStore()
  const startParams = (version: SoftInstalled) => {
    return Promise.resolve(neo4jStore.startParams(version))
  }
  if (!neo4jModule.startExtParam) neo4jModule.startExtParam = startParams as any
  if (!neo4jModule.stopExtParam) neo4jModule.stopExtParam = startParams as any

  AppServiceModule.neo4j = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
