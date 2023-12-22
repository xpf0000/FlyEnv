<template>
  <li
    v-if="showItem.Tools"
    :class="'non-draggable' + (currentPage === '/tools' ? ' active' : '')"
    @click="emit('nav', '/tools')"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon :svg="import('@/svg/tool.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">Tools</span>
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
