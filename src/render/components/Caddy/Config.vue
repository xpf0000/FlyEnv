<template>
  <Conf
    ref="conf"
    :type-flag="'caddy'"
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
    return join(window.Server.BaseDir!, 'caddy/Caddyfile')
  })
  const defaultFile = computed(() => {
    return join(window.Server.BaseDir!, 'caddy/Caddyfile.default')
  })

  fs.existsSync(file.value).then((e) => {
    if (!e) {
      IPC.send('app-fork:caddy', 'initConfig').then((key: string) => {
        IPC.off(key)
        conf?.value?.update()
      })
    }
  })
</script>
