<template>
  <Conf
    ref="conf"
    :type-flag="'temporal-cli'"
    :default-file="defaultFile"
    :file="file"
    :file-ext="'conf'"
    :show-commond="false"
    url="https://docs.temporal.io/cli"
  >
  </Conf>
</template>

<script lang="ts" setup>
  import { computed, nextTick, ref, watch } from 'vue'
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

  const invokeTemporalCli = (...args: any[]) => {
    return new Promise<any>((resolve) => {
      IPC.send('app-fork:temporal-cli', ...args).then((key: string, res: any) => {
        if (res?.code === 200) {
          return
        }
        IPC.off(key)
        resolve(res)
      })
    })
  }

  const ensureConfigFile = async () => {
    if (!file.value || (await fs.existsSync(file.value))) {
      return
    }
    if (!currentVersion.value) {
      return
    }
    const res = await invokeTemporalCli(
      'initConfig',
      JSON.parse(JSON.stringify(currentVersion.value))
    )
    if (res?.code !== 0) {
      return
    }
    await nextTick()
    conf.value?.update()
  }

  watch(
    file,
    () => {
      ensureConfigFile().catch()
    },
    { immediate: true }
  )
</script>
