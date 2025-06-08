<template>
  <Conf
    ref="conf"
    type-flag="node"
    :show-load-default="false"
    :file="file"
    :file-ext="ext"
    :show-commond="false"
  >
  </Conf>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import { extname } from 'path-browserify'

  const props = defineProps<{
    file: string
  }>()

  const ext = computed(() => {
    return extname(props.file) || 'conf'
  })
</script>
