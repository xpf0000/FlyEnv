<template>
  <Conf
    ref="conf"
    :type-flag="'consul'"
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
    return brewStore.currentVersion('consul')
  })

  const file = computed(() => {
    const versionTop = currentVersion?.value?.version?.split('.')?.shift() ?? ''
    if (!versionTop) {
      return ''
    }
    return join(window.Server.BaseDir!, `consul/consul-${versionTop}.json`)
  })
  const defaultFile = computed(() => {
    const versionTop = currentVersion?.value?.version?.split('.')?.shift() ?? ''
    if (!versionTop) {
      return ''
    }
    return join(window.Server.BaseDir!, `consul/consul-${versionTop}.default`)
  })

  fs.existsSync(file.value).then((e) => {
    if (!e && currentVersion.value) {
      IPC.send(
        'app-fork:consul',
        'initConfig',
        JSON.parse(JSON.stringify(currentVersion.value))
      ).then((key: string) => {
        IPC.off(key)
        conf?.value?.update()
      })
    }
  })
</script>
