<template>
  <li
    v-if="showItem.java"
    :class="'non-draggable' + (currentPage === '/java' ? ' active' : '')"
    @click="emit('nav', '/java')"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon :svg="import('@/svg/java.svg?raw')" width="28" height="28" />
      </div>
      <span class="title">Java</span>
    </div>
  </li>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@web/store/app'

  defineProps<{
    currentPage: string
  }>()

  const emit = defineEmits(['nav'])

  const appStore = AppStore()

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem
  })
</script>
