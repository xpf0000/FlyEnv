<template>
  <el-button
    link
    class="mc-action"
    :class="{
      status: lifecycle,
      running: action === 'stop',
      'mc-yellow': action === 'start' || action === 'restart'
    }"
    :title="t(action)"
    :aria-label="t(action)"
    :disabled="disabled"
    :loading="loading"
  >
    <yb-icon :key="action" :svg="icons[action]" width="22" height="22" />
  </el-button>
</template>
<script setup lang="ts">
  import { computed } from 'vue'
  import { t } from './lang'
  const props = defineProps<{
    action: 'start' | 'stop' | 'restart' | 'edit' | 'delete' | 'credentials'
    disabled?: boolean
    loading?: boolean
  }>()
  const lifecycle = computed(() => ['start', 'stop', 'restart'].includes(props.action))
  const icons = {
    start: import('@/svg/play.svg?raw'),
    stop: import('@/svg/stop2.svg?raw'),
    restart: import('@/svg/icon_refresh.svg?raw'),
    edit: import('@/svg/edit.svg?raw'),
    delete: import('@/svg/delete.svg?raw'),
    credentials: import('@/svg/setup.svg?raw')
  }
</script>
<style scoped lang="scss">
  .mc-action {
    margin-left: 0;
  }
  .mc-yellow:not(:disabled):hover :deep(svg) {
    color: #eab308;
  }
</style>
