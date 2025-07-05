<template>
  <Conf
    ref="conf"
    :type-flag="'rabbitmq'"
    :default-file="defaultFile"
    :file="file"
    :file-ext="'conf'"
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
    return brewStore.currentVersion('rabbitmq')
  })

  const conf = ref()

  const file = computed(() => {
    const v = currentVersion?.value?.version?.split('.')?.[0] ?? ''
    if (!v) {
      return ''
    }
    if (window.Server.isWindows) {
      return join(window.Server.BaseDir!, 'rabbitmq', `rabbitmq-${v}.bat`)
    }
    return join(window.Server.BaseDir!, 'rabbitmq', `rabbitmq-${v}.conf`)
  })

  const defaultFile = computed(() => {
    const v = currentVersion?.value?.version?.split('.')?.[0] ?? ''
    if (!v) {
      return ''
    }
    return join(window.Server.BaseDir!, 'rabbitmq', `rabbitmq-${v}-default.conf`)
  })

  watch(
    () => currentVersion?.value?.bin,
    (v) => {
      IPC.send('app-fork:rabbitmq', 'initConfig', JSON.parse(JSON.stringify(v))).then(
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
