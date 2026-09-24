<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === `/${typeFlag}` ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon style="padding: 6px" :svg="import('./kafka.svg?raw')" width="30" height="30" />
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
  import { onBeforeUnmount } from 'vue'
  import { AsideSetup, AppServiceModule } from '@/core/ASide'
  import { BrewStore } from '@/store/brew'
  import type { AllAppModule } from '@/core/type'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import { KafkaManager } from './store'

  const props = withDefaults(
    defineProps<{
      typeFlag?: AllAppModule
      title?: string
    }>(),
    {
      typeFlag: 'kafka',
      title: 'Kafka'
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

  const kafkaModule = BrewStore().module(typeFlag)
  KafkaManager.watchInstalledVersions()
  onBeforeUnmount(() => KafkaManager.stopInstalledVersionsWatch())
  const startParams = (item: ModuleInstalledItem) => {
    return KafkaManager.startParams(item)
  }
  const stopParams = (item: ModuleInstalledItem) => KafkaManager.stopParams(item)
  if (!kafkaModule.startExtParam) kafkaModule.startExtParam = startParams as any
  if (!kafkaModule.stopExtParam) kafkaModule.stopExtParam = stopParams as any

  AppServiceModule[typeFlag] = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
