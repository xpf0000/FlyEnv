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
    <template v-if="!loading">
      <Edit v-if="action === 'edit'" width="22" height="22" />
      <Delete v-else-if="action === 'delete'" width="22" height="22" />
      <yb-icon v-else :key="action" :svg="icons[action]" width="22" height="22" />
    </template>
  </el-button>
</template>
<script setup lang="ts">
  import { computed } from 'vue'
  import { Edit, Delete } from '@element-plus/icons-vue'
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
