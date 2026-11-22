<template>
  <li class="non-draggable" :class="{ active: route.path === '/mysql-cluster' }" @click="nav"
    ><div class="left"
      ><div class="icon-block" :class="{ run: running }"
        ><yb-icon :svg="import('@/svg/mysql.svg?raw')" width="30" height="30" /></div
      ><span class="title">MySQL Cluster</span></div
    ><ServiceSwitch
      :model-value="running > 0"
      :disabled="serviceDisabled"
      :disabled-tooltip="serviceDisabledTooltip"
      :loading="serviceFetching"
      @click.stop
      @change="manager.runAll($event ? 'start' : 'stop')"
    />
  </li>
</template>
<script setup lang="ts">
  import ServiceSwitch from '@/components/Aside/ServiceSwitch.vue'
  import { computed, onUnmounted, watch } from 'vue'
  import router from '@/router'
  import { AsideSetup, AppServiceModule } from '@/core/ASide'
  import { AppStore } from '@/store/app'
  import { I18nT } from '@lang/index'
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
  const serviceDisabledTooltip = computed(() => {
    if (serviceFetching.value) return I18nT('service.sidebarSwitch.busy')
    if (manager.loadError) return manager.loadError
    if (!manager.initialized) return I18nT('service.sidebarSwitch.loading')
    return I18nT('service.sidebarSwitch.addInstance')
  })
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
