<template>
  <Conf
    ref="conf"
    :type-flag="'numa'"
    :default-conf="defaultConf"
    :file="file"
    :file-ext="'toml'"
    :config-language="'ini'"
    :show-commond="false"
    url="https://numa.rs/"
  >
  </Conf>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import { join } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'
  import IPC from '@/util/IPC'

  const defaultConf = ref('')
  const conf = ref()
  const file = join(window.Server.BaseDir!, 'numa/numa.toml')

  const isZh = window.Server.Lang === 'zh'
  const tmpl = join(window.Server.Static!, isZh ? 'tmpl/numa.zh.toml' : 'tmpl/numa.toml')
  fs.readFile(tmpl).then((content: string) => {
    defaultConf.value = content
  })

  fs.existsSync(file).then((e) => {
    if (!e) {
      IPC.send('app-fork:numa', 'initConfig').then((key: string) => {
        IPC.off(key)
        conf?.value?.update()
      })
    }
  })
</script>
