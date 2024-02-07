<template>
  <div class="dns-panel main-right-panel">
    <div class="top-tab" :class="{ running: running }">
      <span class="title">DNS IP: </span>
      <span class="ip"> {{ ip }}</span>
      <el-tooltip
        popper-class="dns-tips-popper"
        :show-after="800"
        :content="$t('host.dnsInfo', { ip: `@${ip}` })"
      >
        <yb-icon :svg="import('@/svg/question.svg?raw')" width="17" height="17" />
      </el-tooltip>
    </div>
    <div class="main-block">
      <div class="table-header">
        <div class="left">
          <template v-if="running">
            <div class="status running" :class="{ disabled: fetching }">
              <yb-icon :svg="import('@/svg/stop2.svg?raw')" @click.stop="dnsStop" />
            </div>
            <div class="status refresh" :class="{ disabled: fetching }">
              <yb-icon :svg="import('@/svg/icon_refresh.svg?raw')" @click.stop="dnsStart" />
            </div>
          </template>
          <div v-else class="status" :class="{ disabled: fetching }">
            <yb-icon :svg="import('@/svg/play.svg?raw')" @click.stop="dnsStart" />
          </div>
        </div>
        <el-button @click.stop="cleanLog">{{ $t('base.clean') }}</el-button>
      </div>
      <el-auto-resizer>
        <template #default="{ height, width }">
          <el-table-v2
            :row-height="42"
            :columns="columns"
            :data="links"
            :width="width"
            :height="height"
            fixed
          >
          </el-table-v2>
        </template>
      </el-auto-resizer>
    </div>
  </div>
</template>

<script lang="tsx" setup>
  import { DnsStore } from '@/store/dns'
  import { computed } from 'vue'
  import type { Column } from 'element-plus'
  import { dnsStart, dnsStop } from '@/util/Service'

  const dnsStore = DnsStore()
  const ip = computed(() => {
    return dnsStore.ip
  })
  const running = computed(() => {
    return dnsStore.running
  })
  const fetching = computed(() => {
    return dnsStore.fetching
  })
  const links = computed(() => {
    return dnsStore.log
  })
  const columns: Column<any>[] = [
    {
      key: 'host',
      title: 'host',
      dataKey: 'host',
      class: 'host-column',
      headerClass: 'host-column',
      width: 300
    },
    {
      key: 'ip',
      title: 'ip',
      dataKey: 'ip',
      width: 240
    },
    {
      key: 'ttl',
      title: 'ttl',
      dataKey: 'ttl',
      width: 120
    }
  ]
  const cleanLog = () => {
    links.value.splice(0)
  }
</script>
