<template>
  <li class="non-draggable" :class="{ active: route.path === '/mysql-cluster' }" @click="nav"
    ><div class="left"
      ><div class="icon-block" :class="{ run: running }"
        ><yb-icon :svg="import('@/svg/mysql.svg?raw')" width="30" height="30" /></div
      ><span class="title">MySQL Cluster</span></div
    ><el-switch
      :model-value="running > 0"
      :disabled="serviceDisabled"
      :loading="serviceFetching"
      @click.stop
      @change="manager.runAll($event ? 'start' : 'stop')"
    />
  </li>
</template>
<script setup lang="ts">
  import { computed, onUnmounted, watch } from 'vue'
  import router from '@/router'
  import { AsideSetup, AppServiceModule } from '@/core/ASide'
  import { AppStore } from '@/store/app'
  import { MysqlClusterManager as manager, registerLifecycle, releaseLifecycle } from './manager'
  import { InstallationManager } from './installations'
  const route = router.currentRoute
  const { nav } = AsideSetup('mysql-cluster')
  // Host sidebar entries read currentPage; keep it aligned on history navigation too.
  const appStore = AppStore()
  watch(
    () => route.value.path,
    (path) => {
      appStore.currentPage = path
    },
    { immediate: true }
  )
  const running = computed(
    () => Object.values(manager.snapshots).filter((s) => s.state === 'running').length
  )
  registerLifecycle()
  const serviceFetching = computed(
    () => manager.allBusy || Object.values(manager.operations).some((operation) => operation.busy)
  )
  const serviceDisabled = computed(
    () =>
      serviceFetching.value ||
      !manager.initialized ||
      manager.blocked ||
      !manager.catalog.instances.length
  )
  AppServiceModule['mysql-cluster'] = {
    groupDo: (isRunning: boolean, interactive = true) => [
      manager.runAll(isRunning ? 'stop' : 'start', interactive).then((result) =>
        result.status === 'completed'
          ? true
          : result.items
              .map((item) => item.error)
              .filter(Boolean)
              .join('\n') || result.status
      )
    ],
    switchChange: () => manager.runAll(running.value ? 'stop' : 'start'),
    serviceDisabled,
    serviceRunning: computed(() => running.value > 0),
    serviceFetching,
    showItem: computed(() => appStore.config.setup.common.showItem?.['mysql-cluster'] !== false)
  } as any
  manager.load().catch(() => undefined)
  onUnmounted(() => {
    releaseLifecycle()
    delete AppServiceModule['mysql-cluster']
    void InstallationManager.cancel()
  })
</script>
