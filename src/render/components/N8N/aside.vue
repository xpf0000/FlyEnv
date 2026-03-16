<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === '/n8n' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon
          :svg="import('@/svg/n8n.svg?raw')"
          style="padding: 4px"
          width="28"
          height="28"
        />
      </div>
      <span class="title">n8n</span>
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
  import { onMounted, watch } from 'vue'
  import { AsideSetup, AppServiceModule } from '@/core/ASide'
  import { BrewStore } from '@/store/brew'
  import IPC from '@/util/IPC'

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
  } = AsideSetup('n8n')

  AppServiceModule.n8n = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any

  // On app startup, check if n8n is already running (e.g. started from CLI)
  const brewStore = BrewStore()
  let checked = false
  const doCheck = () => {
    if (checked) return
    const installed = brewStore.module('n8n').installed
    if (installed.length === 0) return
    checked = true
    const item = installed[0]
    if (item.run) return
    IPC.send('app-fork:n8n', 'checkRunning', JSON.parse(JSON.stringify(item))).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0 && res?.data?.running) {
          item.run = true
          item.pid = res.data.pid ?? ''
        }
      }
    )
  }

  onMounted(() => {
    const installed = brewStore.module('n8n').installed
    if (installed.length > 0) {
      doCheck()
    } else {
      const stop = watch(
        () => brewStore.module('n8n').installed.length,
        (len) => {
          if (len > 0) {
            stop()
            doCheck()
          }
        }
      )
    }
  })
</script>
