<template>
  <Conf
    ref="conf"
    :type-flag="'kafka'"
    :default-file="defaultFile"
    :file="file"
    :file-ext="'properties'"
    :config-language="'ini'"
    :show-commond="false"
  >
  </Conf>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import IPC from '@/util/IPC'
  import { BrewStore } from '@/store/brew'
  import { join } from '@/util/path-browserify'

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('kafka')
  })

  const conf = ref()

  const file = computed(() => {
    const v = currentVersion?.value?.version ?? ''
    if (!v) {
      return ''
    }
    return join(window.Server.BaseDir!, 'kafka', `kafka-${v}`, 'config', 'server.properties')
  })

  const defaultFile = computed(() => {
    const v = currentVersion?.value?.version ?? ''
    if (!v) {
      return ''
    }
    return join(
      window.Server.BaseDir!,
      'kafka',
      `kafka-${v}`,
      'config',
      'server-default.properties'
    )
  })

  watch(
    () => currentVersion?.value?.bin,
    () => {
      const version = currentVersion?.value
      if (!version?.version) {
        return
      }
      IPC.send('app-fork:kafka', 'initConfig', JSON.parse(JSON.stringify(version))).then(
        (key: string) => {
          IPC.off(key)
          conf.value.update()
        }
      )
    },
    {
      immediate: true
    }
  )
</script>
