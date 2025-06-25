<template>
  <Conf
    ref="conf"
    :type-flag="'etcd'"
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
  import IPC from '@/util/IPC'
  import { join } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'

  const conf = ref()
  const index = ref(1)
  const file = computed(() => {
    if (index.value < 0) {
      return ''
    }
    return join(window.Server.BaseDir!, 'etcd/etcd.yaml')
  })
  const defaultFile = computed(() => {
    if (index.value < 0) {
      return ''
    }
    return join(window.Server.BaseDir!, 'etcd/etcd.yaml.default')
  })
  console.log('config file: ', file.value)
  fs.existsSync(file.value).then((e) => {
    if (!e) {
      IPC.send('app-fork:etcd', 'initConfig').then((key: string) => {
        IPC.off(key)
        index.value += 1
        conf?.value?.update()
      })
    }
  })
</script>
