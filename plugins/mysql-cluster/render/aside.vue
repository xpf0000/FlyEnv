<template>
  <li
    class="non-draggable"
    :class="{ active: route.path === '/mysql-cluster' }"
    @click="router.push('/mysql-cluster')"
    ><div class="left"
      ><div class="icon-block" :class="{ run: running }"
        ><yb-icon :svg="import('@/svg/mysql.svg?raw')" width="30" height="30" /></div
      ><span class="title">MySQL Cluster</span></div
    ><el-badge v-if="running" :value="running" type="success"
  /></li>
</template>
<script setup lang="ts">
  import { computed } from 'vue'
  import router from '@/router'
  import { AppServiceModule } from '@/core/ASide'
  import { MysqlClusterManager as manager, registerLifecycle } from './manager'
  const route = router.currentRoute
  const running = computed(
    () => Object.values(manager.snapshots).filter((s) => s.state === 'running').length
  )
  registerLifecycle()
  AppServiceModule['mysql-cluster'] = {
    groupDo: (isRunning: boolean) =>
      manager.catalog.clusters.map((group) =>
        manager.runGroup(group, isRunning ? 'stop' : 'start').then((result) =>
          result.status === 'completed'
            ? true
            : result.items
                .map((i) => i.error)
                .filter(Boolean)
                .join('\n')
        )
      ),
    serviceRunning: computed(() => running.value > 0),
    serviceFetching: computed(() => Object.values(manager.operations).some((o) => o.busy)),
    showItem: computed(() => true)
  } as any
  manager.load().catch(() => undefined)
</script>
