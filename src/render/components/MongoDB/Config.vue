<template>
  <Conf
    ref="conf"
    :type-flag="'mongodb'"
    :default-conf="defaultConf"
    :file="file"
    :file-ext="'conf'"
    :show-commond="false"
  >
  </Conf>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import { AppStore } from '@/store/app'
  import { join } from 'path-browserify'
  import { fs } from '@/util/NodeFn'

  const appStore = AppStore()

  const currentVersion = computed(() => {
    return appStore.config?.server?.mongodb?.current?.version
  })

  const vm = computed(() => {
    return currentVersion?.value?.split('.')?.slice(0, 2)?.join('.')
  })

  const defaultConf = ref('')
  const conf = ref()
  const file = computed(() => {
    if (!vm.value) {
      return ''
    }
    return join(window.Server.MongoDBDir, `mongodb-${vm.value}.conf`)
  })

  const getDefault = () => {
    const tmpl = join(window.Server.Static, 'tmpl/mongodb.conf')
    const dataDir = join(window.Server.MongoDBDir, `data-${vm.value}`)
    fs.readFile(tmpl, 'utf-8').then((conf: string) => {
      defaultConf.value = conf.replace('##DB-PATH##', dataDir)
    })
  }

  watch(
    vm,
    (v) => {
      if (v && !defaultConf.value) {
        getDefault()
      }
    },
    {
      immediate: true
    }
  )
</script>
