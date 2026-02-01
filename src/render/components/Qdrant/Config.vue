<template>
  <Conf
    ref="conf"
    :type-flag="'qdrant'"
    :default-file="defaultFile"
    :file="file"
    :file-ext="'yaml'"
    config-language="yaml"
    :show-commond="false"
    url="https://github.com/qdrant/qdrant/blob/master/config/config.yaml"
  >
  </Conf>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import { join, dirname } from '@/util/path-browserify'
  import { BrewStore } from '@/store/brew'

  const brewStore = BrewStore()
  const currentVersion = computed(() => {
    return brewStore.currentVersion('qdrant')
  })

  const file = computed(() => {
    if (!currentVersion.value) {
      return ''
    }
    return join(dirname(currentVersion.value.bin), 'config/config.yaml')
  })
  const defaultFile = computed(() => {
    if (!currentVersion.value) {
      return ''
    }
    return join(dirname(currentVersion.value.bin), 'config/config.default.yaml')
  })
</script>
