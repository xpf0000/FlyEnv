<template>
  <Conf
    ref="conf"
    :type-flag="'ftp-srv'"
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
  const file = computed(() => {
    return join(window.Server.FTPDir!, `ftp-srv.conf`)
  })
  const defaultFile = computed(() => {
    return join(window.Server.FTPDir!, `ftp-srv.conf.default`)
  })

  fs.existsSync(file.value).then((e) => {
    if (!e) {
      IPC.send('app-fork:ftp-srv', 'initConf').then((key: string) => {
        IPC.off(key)
        conf?.value?.update()
      })
    }
  })
</script>
