<template>
  <Conf
    ref="conf"
    :type-flag="'tomcat'"
    :default-file="defaultFile"
    :file="file"
    :file-ext="'conf'"
    :show-commond="false"
  >
  </Conf>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import { AppStore } from '@/store/app'

  const { join } = require('path')

  const props = defineProps<{
    fileName: string
  }>()

  const appStore = AppStore()

  const currentVersion = computed(() => {
    return appStore.config?.server?.tomcat?.current
  })

  const conf = ref()
  const file = computed(() => {
    if (!currentVersion.value) {
      return ''
    }
    return join(currentVersion.value.path, `conf/${props.fileName}`)
  })

  const defaultFile = computed(() => {
    if (!currentVersion.value) {
      return ''
    }
    return join(currentVersion.value.path, `conf/${props.fileName}.default`)
  })
</script>
