<template>
  <div class="dns-panel main-right-panel">
    <div class="top-tab" :class="{ running: running }">
      <span class="title">DNS IP: </span>
      <span class="ip"> {{ ip }}</span>
      <el-popover popper-class="dns-tips-popper" :show-after="800" width="auto">
        <template #default>
          <div>
            {{ I18nT('host.dnsInfo', { ip: `@${ip}` }) }}
          </div>
        </template>
        <template #reference>
          <yb-icon :svg="import('@/svg/question.svg?raw')" width="17" height="17" />
        </template>
      </el-popover>
    </div>
    <div class="main-block">
      <el-card>
        <template #header>
          <div class="table-header">
            <div class="left">
              <template v-if="fetching">
                <el-button :loading="true" link></el-button>
              </template>
              <template v-else>
                <template v-if="running">
                  <div class="status running" :class="{ disabled: fetching }">
                    <yb-icon :svg="import('@/svg/stop2.svg?raw')" @click.stop="dnsStore.dnsStop" />
                  </div>
                  <div class="status refresh" :class="{ disabled: fetching }">
                    <yb-icon
                      :svg="import('@/svg/icon_refresh.svg?raw')"
                      @click.stop="dnsStore.dnsRestart"
                    />
                  </div>
                </template>
                <div v-else class="status" :class="{ disabled: fetching }">
                  <yb-icon :svg="import('@/svg/play.svg?raw')" @click.stop="dnsStore.dnsStart" />
                </div>
              </template>
            </div>
            <el-button @click.stop="cleanLog">{{ I18nT('base.clean') }}</el-button>
          </div>
        </template>
        <el-auto-resizer>
          <template #default="{ height, width }">
            <el-table-v2
              :row-height="60"
              :header-height="60"
              :columns="columns"
              :data="links"
              :width="width"
              :height="height"
              fixed
            >
            </el-table-v2>
          </template>
        </el-auto-resizer>
      </el-card>
    </div>
  </div>
</template>

<script lang="tsx" setup>
  import { computed } from 'vue'
  import { DnsStore } from './dns'
  import type { Column } from 'element-plus'
  import { I18nT } from '@lang/index'

  const dnsStore = DnsStore()
  dnsStore.init()

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
    return []
  })
  const columns: Column[] = [
    {
      key: 'host',
      title: 'Host',
      dataKey: 'host',
      class: 'host-column',
      headerClass: 'host-column',
      width: 300,
      headerCellRenderer: () => (
        <span style="padding-left: 24px;" class="flex items-center">
          host
        </span>
      ),
      cellRenderer: ({ cellData: host }) => <span style="padding-left: 24px;">{host}</span>
    },
    {
      key: 'ip',
      title: 'IP Address',
      dataKey: 'ip',
      width: 240
    },
    {
      key: 'ttl',
      title: 'TTL',
      dataKey: 'ttl',
      width: 120
    }
  ]
  const cleanLog = () => {
    links.value.splice(0)
  }

  // onUnmounted(() => {
  //   dnsStore.deinit()
  // })
  //
  // defineExpose({
  //   ip
  // })
</script>
