<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/minio' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon style="padding: 0" :svg="import('@/svg/minio.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">Minio</span>
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
  import { MinioSetup } from './setup'
  import { ServiceActionExtParam } from '@/util/Service'
  import { type AllAppModule } from '@/core/type'
  import { type SoftInstalled } from '@/store/brew'

  import { join } from 'path-browserify'

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
  } = AsideSetup('minio')

  MinioSetup.init()

  ServiceActionExtParam['minio'] = (typeFlag: AllAppModule, fn: string, version: SoftInstalled) => {
    return new Promise<any[]>((resolve) => {
      if (fn === 'startService') {
        const dir = join(window.Server.BaseDir!, `minio/data`)
        const p = MinioSetup.dir?.[version.bin] ?? dir
        resolve([p])
        return
      }
      return resolve([])
    })
  }

  AppServiceModule.minio = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
