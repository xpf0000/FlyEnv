<template>
  <li
    v-if="showItem.Hosts"
    :class="'non-draggable' + (currentPage === '/host' ? ' active' : '')"
    @click="emit('nav', '/host')"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon :svg="import('@/svg/host.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">Hosts</span>
    </div>
  </li>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@/store/app'

  defineProps<{
    currentPage: string
  }>()

  const emit = defineEmits(['nav'])

  const appStore = AppStore()

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem
  })
</script>
