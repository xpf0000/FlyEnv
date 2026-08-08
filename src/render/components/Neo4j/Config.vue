<template>
  <Conf
    ref="conf"
    type-flag="neo4j"
    :default-file="defaultFile"
    :file="file"
    file-ext="conf"
    config-language="ini"
    :show-commond="false"
    url="https://neo4j.com/docs/operations-manual/current/configuration/"
  />
</template>

<script lang="ts" setup>
  import { computed, nextTick, ref, watch } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import { BrewStore, type SoftInstalled } from '@/store/brew'
  import IPC from '@/util/IPC'
  import { join } from '@/util/path-browserify'
  import { Neo4jManager } from './store'

  const brewStore = BrewStore()
  const conf = ref()
  const file = ref('')
  const defaultFile = ref('')
  const currentVersion = computed(() => brewStore.currentVersion('neo4j'))

  const invoke = (...args: any[]) =>
    new Promise<any>((resolve) => {
      IPC.send('app-fork:neo4j', ...args).then((key: string, res: any) => {
        if (res?.code === 200) return
        IPC.off(key)
        resolve(res)
      })
    })

  const fallbackPaths = (item: SoftInstalled) => {
    const instanceDir = Neo4jManager.instanceDirFor(item)
    const configFile = join(instanceDir, 'conf/neo4j.conf')
    return { file: configFile, defaultFile: `${configFile}.default` }
  }

  const initConfig = async (item?: SoftInstalled) => {
    if (!item?.version) {
      file.value = ''
      defaultFile.value = ''
      return
    }
    const fallback = fallbackPaths(item)
    file.value = fallback.file
    defaultFile.value = fallback.defaultFile
    const result = await invoke('initConfig', JSON.parse(JSON.stringify(item)))
    if (result?.code === 0) {
      file.value =
        (typeof result.data === 'string'
          ? result.data
          : (result?.data?.file ?? result?.data?.configPath)) ?? file.value
      defaultFile.value =
        (typeof result.data === 'string'
          ? `${result.data}.default`
          : (result?.data?.defaultFile ?? result?.data?.defaultConfigPath)) ?? defaultFile.value
      await nextTick()
      conf.value?.update?.()
    }
  }

  watch(currentVersion, (item) => initConfig(item).catch(), { immediate: true })
</script>
