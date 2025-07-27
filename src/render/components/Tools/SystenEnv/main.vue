<template>
  <component :is="vm"></component>
</template>
<script lang="ts" setup>
  import { computed, defineAsyncComponent, markRaw } from 'vue'

  const isMacOS = computed(() => {
    return window.Server.isMacOS
  })
  const isWindows = computed(() => {
    return window.Server.isWindows
  })
  const isLinux = computed(() => {
    return window.Server.isLinux
  })

  const vm = computed(() => {
    if (isWindows.value) {
      return markRaw(defineAsyncComponent(() => import('./Index.win.vue')))
    }
    return markRaw(defineAsyncComponent(() => import('./Index.vue')))
  })
</script>
