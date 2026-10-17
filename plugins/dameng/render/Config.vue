<template>
  <Conf
    type-flag="dameng"
    :file="file"
    file-ext="ini"
    config-language="ini"
    :show-commond="false"
    :show-load-default="false"
    :version="currentVersion"
  />
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import { BrewStore } from '@/store/brew'
  import type { DamengInstalled } from './store'

  const currentVersion = computed(
    () => BrewStore().currentVersion('dameng') as DamengInstalled | undefined
  )
  const file = computed(() => {
    const runtime = currentVersion.value?.damengRuntime
    return runtime?.initialized ? runtime.configFile : ''
  })
</script>
