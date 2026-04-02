<template>
  <Conf
    ref="conf"
    :type-flag="'openclaw'"
    :show-load-default="false"
    :file="file"
    :file-ext="'json'"
    :show-commond="false"
  >
  </Conf>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import { OpenClawSetup } from '@/components/OpenClaw/setup'

  const conf = ref()

  const file = computed(() => {
    return OpenClawSetup.configFile
  })
</script>
