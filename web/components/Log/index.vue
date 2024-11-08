<template>
  <div ref="logRef" class="block"></div>
</template>
<script setup lang="ts">
  import { ref, watch } from 'vue'
  import { LogSetup } from '@web/components/Log/setup'

  const props = defineProps<{
    logFile: string
  }>()

  const file = ref('')

  const { logRef, logDo, isDisabled } = LogSetup(file)

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
