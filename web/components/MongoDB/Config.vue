<template>
  <Conf ref="conf" :type-flag="'mongodb'" :conf="content" :file-ext="'conf'" :show-commond="false">
  </Conf>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import Conf from '@web/components/Conf/index.vue'

  const content = ref('')

  import('@web/config/mongodb.conf.txt?raw').then((res) => {
    content.value = res.default
  })
</script>
