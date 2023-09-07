<template>
  <div class="dns-panel main-right-panel">
    <div class="top-tab">
      <span class="title" :class="{ running: running }">DNS IP: </span>
      <span class="ip"> {{ ip }}</span>
    </div>
    <div class="main-block">
      {{ $t('host.dnsInfo', { ip: `@${ip}` }) }}
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { DnsStore } from '@/store/dns'
  import { computed } from 'vue'
  const dnsStore = DnsStore()
  const ip = computed(() => {
    return dnsStore.ip
  })
  const running = computed(() => {
    return dnsStore.running
  })
</script>

<style lang="scss">
  .dns-panel {
    height: 100%;
    overflow: auto;
    line-height: 1.75;
    padding: 30px 18px;
    display: flex;
    flex-direction: column;
    > .top-tab {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      margin-bottom: 20px;
      margin-top: 80px;
      flex-shrink: 0;

      > .title {
        margin-right: 20px;

        &.running {
          color: #01cc74;
        }
      }
    }
    .main-block {
      flex: 1;
      width: 100%;
      padding: 12px 60px;
      overflow: hidden;
      word-wrap: break-word;
      white-space: pre-wrap;
      user-select: text;
    }
  }
</style>
