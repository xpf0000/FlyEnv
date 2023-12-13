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
        <span>{{ $t('util.count') }} {{ links.length }}</span>
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
  import { DnsStore } from '../../store/dns'
  import { computed } from 'vue'
  import type { Column } from 'element-plus'
  const dnsStore = DnsStore()
  const ip = computed(() => {
    return dnsStore.ip
  })
  const running = computed(() => {
    return dnsStore.running
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

<style lang="scss">
  .dns-tips-popper {
    max-width: 50vw;
    white-space: pre-line;
  }
  .dns-panel {
    height: 100%;
    overflow: auto;
    line-height: 1.75;
    padding: 0 18px;
    display: flex;
    flex-direction: column;
    > .top-tab {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      margin-top: 50px;
      flex-shrink: 0;

      &.running {
        color: #01cc74;
      }

      > svg {
        color: #fff;
        margin-left: 20px;
      }

      > .title {
        margin-right: 20px;
      }
    }
    .main-block {
      flex: 1;
      width: 100%;
      padding: 30px 10px;
      overflow: hidden;
      display: flex;
      flex-direction: column;

      .table-header {
        flex-shrink: 0;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 8px;
        background-color: #141414;
        color: #fff;
        border-bottom: 1px #363637 solid;
        font-weight: 700;
      }

      > .el-auto-resizer {
        height: auto !important;
        flex: 1;
        overflow: hidden;
      }

      .host-column {
        width: calc(100% - 360px) !important;

        > span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          user-select: text;
        }
      }
    }
  }
</style>
