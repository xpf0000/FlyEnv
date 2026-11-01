<template>
  <Conf
    ref="conf"
    :type-flag="'samwaf'"
    :default-file="defaultFile"
    :file="file"
    :file-ext="'yml'"
    :config-language="'yaml'"
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
    return brewStore.currentVersion('samwaf')
  })

  const conf = ref()
  const file = ref('')
  const defaultFile = ref('')

  watch(
    () => currentVersion?.value?.bin,
    () => {
      const version = currentVersion?.value
      if (!version?.version) {
        return
      }
      IPC.send('app-fork:samwaf', 'initConfig', JSON.parse(JSON.stringify(version))).then(
        (key: string) => {
          IPC.off(key)
          // The seeded file IS the live config; defaultFile is optional in the
          // Conf component, and pointing it at the same path keeps "load
          // default" a harmless same-content reload.
          const path = join(window.Server.AppDir!, 'samwaf', version.version!, 'conf', 'config.yml')
          file.value = path
          defaultFile.value = path
          conf.value.update()
        }
      )
    },
    {
      immediate: true
    }
  )
</script>
