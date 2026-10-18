<template>
  <div
    class="w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xl font-bold select-none shadow-[0_2px_6px_rgba(0,0,0,0.15)]"
    :style="{ background: folderGradient(id) }"
    aria-hidden="true"
    >{{ folderInitial(name) }}</div
  >
</template>

<script lang="ts" setup>
  import { folderInitial, folderGradient } from './avatar'
  defineProps<{ id: string; name: string }>()
</script>
