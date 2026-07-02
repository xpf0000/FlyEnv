<template>
  <div v-if="!AppToolStore.floatShow" class="app-ai-btn tool-btn" @click.stop="show">
    <yb-icon :svg="import('@/svg/tool.svg?raw')" width="26" height="26" />
  </div>
</template>

<script lang="ts" setup>
  import { AppToolStore } from '@/components/Tools/store'

  const show = () => {
    AppToolStore.floatShow = true
  }
</script>
