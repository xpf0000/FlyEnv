<template>
  <Conf
    ref="conf"
    :type-flag="'elasticsearch'"
    :show-load-default="false"
    :file="file"
    :file-ext="ext"
    :show-commond="false"
  >
  </Conf>
</template>

<script lang="ts" setup>
  import { computed, ComputedRef, ref } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import { BrewStore, SoftInstalled } from '@/store/brew'
  import { AppStore } from '@/store/app'

  const props = defineProps<{
    name: string
    ext: string
  }>()

  const { join } = require('path')

  const appStore = AppStore()
  const brewStore = BrewStore()

  const version = computed(() => {
    const flag = 'elasticsearch'
    const server: any = appStore.config.server
    return server?.[flag]?.current
  })

  const currentVersion: ComputedRef<SoftInstalled | undefined> = computed(() => {
    return brewStore
      .module('elasticsearch')
      ?.installed?.find(
        (i) => i.path === version?.value?.path && i.version === version?.value?.version
      )
  })

  const conf = ref()
  const file = computed(() => {
    if (currentVersion?.value?.path) {
      return join(currentVersion?.value?.path, 'config', props.name)
    }
    return ''
  })
</script>
