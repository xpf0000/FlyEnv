<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === `/${typeFlag}` ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon
          style="padding: 6px"
          :svg="import('./opensearch.svg?raw')"
          width="30"
          height="30"
        />
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
  import type { AllAppModule } from '@/core/type'

  const props = withDefaults(
    defineProps<{
      typeFlag?: AllAppModule
      title?: string
    }>(),
    {
      typeFlag: 'opensearch',
      title: 'OpenSearch'
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

  AppServiceModule[typeFlag] = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
