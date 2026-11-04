<template>
  <div ref="logRef" class="block"></div>
</template>
<script setup lang="ts">
  import { ref, watch } from 'vue'
  import type { SoftInstalled } from '@/store/brew'
  import { LogSetup } from './setup'

  const props = defineProps<{
    logFile: string
    version?: SoftInstalled
  }>()

  const file = ref('')

  const { logRef, logDo, isDisabled } = LogSetup(file, () => props.version)

  watch(
    () => props.logFile,
    (v) => {
      file.value = v
    },
    {
      immediate: true
    }
  )

  defineExpose({
    logDo,
    isDisabled
  })
</script>
