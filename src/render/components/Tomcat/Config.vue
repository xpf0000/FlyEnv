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
  import { join } from '@/util/path-browserify'

  const props = defineProps<{
    fileName: string
  }>()

  const appStore = AppStore()

  const currentVersion = computed(() => {
    return appStore.config?.server?.tomcat?.current
  })

  const currentBaseDir = computed(() => {
    const v = currentVersion?.value?.version?.split('.')?.shift() ?? ''
    return join(window.Server.BaseDir!, `tomcat/tomcat${v}`)
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
