<template>
  <Conf
    ref="conf"
    :type-flag="'pure-ftpd'"
    :default-file="defaultFile"
    :file="file"
    :file-ext="'conf'"
    :show-commond="false"
  >
  </Conf>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import Conf from '@web/components/Conf/index.vue'
  import IPC from '@/util/IPC'

  const { join } = require('path')
  const { existsSync } = require('fs-extra')

  const conf = ref()
  const file = computed(() => {
    return join(global.Server.FTPDir, `pure-ftpd.conf`)
  })
  const defaultFile = computed(() => {
    return join(global.Server.FTPDir, `pure-ftpd.conf.default`)
  })

  if (!existsSync(file.value)) {
    IPC.send('app-fork:pure-ftpd', 'initConf').then((key: string) => {
      IPC.off(key)
      conf?.value?.update()
    })
  }
</script>
