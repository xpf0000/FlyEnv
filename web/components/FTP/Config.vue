<template>
  <Conf
    ref="conf"
    :type-flag="'pure-ftpd'"
    :conf="content"
    :file-ext="'conf'"
    :show-commond="false"
  >
  </Conf>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import Conf from '@web/components/Conf/index.vue'

  const conf = ref()
  const content = ref('')

  import('@web/config/ftp.conf.txt?raw').then((res) => {
    content.value = res.default
  })
</script>
