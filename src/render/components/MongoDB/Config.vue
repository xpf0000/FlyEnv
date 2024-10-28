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

  const { join } = require('path')
  const { readFile } = require('fs-extra')

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
    return join(global.Server.MongoDBDir, `mongodb-${vm.value}.conf`)
  })

  const getDefault = () => {
    const tmpl = join(global.Server.Static, 'tmpl/mongodb.conf')
    const dataDir = join(global.Server.MongoDBDir, `data-${vm.value}`)
    readFile(tmpl, 'utf-8').then((conf: string) => {
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
