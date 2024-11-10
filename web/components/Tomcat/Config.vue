<template>
  <Conf ref="conf" :type-flag="'tomcat'" :conf="content" :file-ext="'conf'" :show-commond="false">
  </Conf>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import Conf from '@web/components/Conf/index.vue'

  const props = defineProps<{
    fileName: string
  }>()

  const conf = ref()
  const content = ref('')

  if (props.fileName === 'server.xml') {
    import('@web/config/tomcat.server.conf.txt?raw').then((res) => {
      content.value = res.default
    })
  } else {
    import('@web/config/tomcat.web.conf.txt?raw').then((res) => {
      content.value = res.default
    })
  }
</script>
