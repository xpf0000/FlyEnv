<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/postgresql' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon
          style="padding: 7px"
          :svg="import('@/svg/postgresql.svg?raw')"
          width="30"
          height="30"
        />
      </div>
      <span class="title">PostgreSQL</span>
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
  import { BrewStore } from '@/store/brew'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import { join } from '@/util/path-browserify'
  import { PostgreSqlSetup } from '@/components/PostgreSql/setup'
  import { computed } from 'vue'

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
  } = AsideSetup('postgresql')

  PostgreSqlSetup.init()

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('postgresql')
  })

  const module = brewStore.module('postgresql')
  const extParamFn = (version: ModuleInstalledItem) => {
    return new Promise<any[]>((resolve) => {
      const versionTop = currentVersion?.value?.version?.split('.')?.shift() ?? ''
      const dir = join(window.Server.PostgreSqlDir!, `postgresql${versionTop}`)
      const p = PostgreSqlSetup.dir?.[version.bin] ?? dir
      resolve([p])
    })
  }
  if (!module?.startExtParam) {
    module.startExtParam = extParamFn
  }
  if (!module?.stopExtParam) {
    module.stopExtParam = extParamFn
  }

  AppServiceModule.postgresql = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
