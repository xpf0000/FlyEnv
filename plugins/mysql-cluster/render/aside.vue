<template>
  <li class="non-draggable" :class="{ active: route.path === '/mysql-cluster' }" @click="nav"
    ><div class="left"
      ><div class="icon-block" :class="{ run: running }"
        ><yb-icon :svg="import('@/svg/mysql.svg?raw')" width="30" height="30" /></div
      ><span class="title">MySQL Cluster</span></div
    ><el-badge v-if="running" :value="running" type="success"
  /></li>
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
  AppServiceModule['mysql-cluster'] = {
    groupDo: (isRunning: boolean, interactive = true) =>
      manager.catalog.clusters.map((group) =>
        manager.runGroup(group, isRunning ? 'stop' : 'start', interactive).then((result) =>
          result.status === 'completed'
            ? true
            : result.items
                .map((i) => i.error)
                .filter(Boolean)
                .join('\n')
        )
      ),
    switchChange: () => {
      for (const group of manager.catalog.clusters)
        void manager.runGroup(group, running.value ? 'stop' : 'start')
    },
    serviceDisabled: computed(() => Object.values(manager.operations).some((o) => o.busy)),
    serviceRunning: computed(() => running.value > 0),
    serviceFetching: computed(() => Object.values(manager.operations).some((o) => o.busy)),
    showItem: computed(() => true)
  } as any
  manager.load().catch(() => undefined)
  onUnmounted(() => {
    releaseLifecycle()
    delete AppServiceModule['mysql-cluster']
    void InstallationManager.cancel()
  })
</script>
