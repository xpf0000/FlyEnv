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
  import type { SoftInstalled } from '@shared/app'
  import { join } from '@/util/path-browserify'
  import { tomcatCatalinaBase } from './setup'

  const props = defineProps<{
    fileName: string
  }>()

  const appStore = AppStore()

  const currentVersion = computed(() => {
    return appStore.config?.server?.tomcat?.current
  })

  const currentBaseDir = computed(() => {
    if (!currentVersion.value) return ''
    return tomcatCatalinaBase(currentVersion.value as SoftInstalled)
  })

  const conf = ref()
  const file = computed(() => {
    if (!currentBaseDir.value) {
      return ''
    }
    return join(currentBaseDir.value, `conf/${props.fileName}`)
  })

  const defaultFile = computed(() => {
    if (!currentBaseDir.value) {
      return ''
    }
    return join(currentBaseDir.value, `conf/${props.fileName}.default`)
  })
</script>
