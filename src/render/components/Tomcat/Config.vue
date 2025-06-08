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
  import { BrewStore } from '@/store/brew'
  import { TomcatSetup } from '@/components/Tomcat/setup'

  import { join } from 'path-browserify'

  const props = defineProps<{
    fileName: string
  }>()

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('tomcat')
  })

  const conf = ref()
  const file = computed(() => {
    if (!currentVersion.value) {
      return ''
    }

    let baseDir = ''

    if (currentVersion?.value?.bin) {
      if (TomcatSetup.CATALINA_BASE[currentVersion.value.bin]) {
        baseDir = TomcatSetup.CATALINA_BASE[currentVersion.value.bin]
      } else {
        const v = currentVersion?.value?.version?.split('.')?.shift() ?? ''
        baseDir = join(window.Server.BaseDir!, `tomcat/tomcat${v}`)
      }
    } else {
      return ''
    }

    return join(baseDir, `conf/${props.fileName}`)
  })

  const defaultFile = computed(() => {
    if (!currentVersion.value) {
      return ''
    }

    let baseDir = ''

    if (currentVersion?.value?.bin) {
      if (TomcatSetup.CATALINA_BASE[currentVersion.value.bin]) {
        baseDir = TomcatSetup.CATALINA_BASE[currentVersion.value.bin]
      } else {
        const v = currentVersion?.value?.version?.split('.')?.shift() ?? ''
        baseDir = join(window.Server.BaseDir!, `tomcat/tomcat${v}`)
      }
    } else {
      return ''
    }

    return join(baseDir, `conf/${props.fileName}.default`)
  })
</script>
