<template>
  <Conf
    ref="conf"
    :type-flag="'zincsearch'"
    :default-file="defaultFile"
    :file="file"
    :file-ext="'env'"
    config-language="ini"
    :show-commond="false"
    url="https://zincsearch-docs.zinc.dev/quickstart/"
  >
  </Conf>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import IPC from '@/util/IPC'
  import { join } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'

  const conf = ref()
  const index = ref(1)
  const file = computed(() => {
    if (index.value < 0) {
      return ''
    }
    return join(window.Server.BaseDir!, 'zincsearch/zincsearch.env')
  })
  const defaultFile = computed(() => {
    if (index.value < 0) {
      return ''
    }
    return join(window.Server.BaseDir!, 'zincsearch/zincsearch.env.default')
  })

  fs.existsSync(file.value).then((e) => {
    if (!e) {
      IPC.send('app-fork:zincsearch', 'initConfig').then((key: string) => {
        IPC.off(key)
        index.value += 1
        conf?.value?.update()
      })
    }
  })
</script>
