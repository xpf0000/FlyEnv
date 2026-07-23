<template>
  <Conf
    ref="conf"
    :type-flag="'temporal-cli'"
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
  import { BrewStore } from '@/store/brew'

  const conf = ref()

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('temporal-cli')
  })

  const file = computed(() => {
    const v = currentVersion?.value?.version ?? ''
    if (!v) {
      return ''
    }
    return join(window.Server.BaseDir!, `temporal-cli/temporal-cli-v${v}.conf`)
  })
  const defaultFile = computed(() => {
    return file.value ? `${file.value}.default` : ''
  })

  fs.existsSync(file.value).then((e) => {
    if (!e && currentVersion.value) {
      IPC.send(
        'app-fork:temporal-cli',
        'initConfig',
        JSON.parse(JSON.stringify(currentVersion.value))
      ).then((key: string) => {
        IPC.off(key)
        conf?.value?.update()
      })
    }
  })
</script>
