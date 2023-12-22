<template>
  <li
    v-if="showItem.NodeJS"
    :class="'non-draggable' + (currentPage === '/node' ? ' active' : '')"
    @click="emit('nav', '/node')"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon :svg="import('@/svg/nodejs.svg?raw')" width="28" height="28" />
      </div>
      <span class="title">NodeJS</span>
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
