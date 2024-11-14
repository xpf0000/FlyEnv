<template>
  <Conf
    ref="conf"
    :type-flag="'redis'"
    :default-file="defaultFile"
    :file="file"
    :file-ext="'conf'"
    :show-commond="true"
    @on-type-change="onTypeChange"
  >
    <template #common>
      <Common :setting="commonSetting" />
    </template>
  </Conf>
</template>

<script lang="ts" setup>
  import { computed, ref, watch, Ref } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import Common from '@/components/Conf/common.vue'
  import type { CommonSetItem } from '@/components/Conf/setup'
  import { I18nT } from '@shared/lang'
  import { debounce } from 'lodash'
  import { AppStore } from '@/store/app'
  import IPC from '@/util/IPC'

  const { join } = require('path')
  const { existsSync } = require('fs-extra')

  const appStore = AppStore()
  const conf = ref()
  const commonSetting: Ref<CommonSetItem[]> = ref([])

  const currentVersion = computed(() => {
    return appStore.config?.server?.redis?.current?.version
  })

  const vm = computed(() => {
    return currentVersion?.value?.split('.')?.shift()
  })

  const file = computed(() => {
    if (!vm.value) {
      return ''
    }
    return join(global.Server.RedisDir, `redis-${vm.value}.conf`)
  })

  const defaultFile = computed(() => {
    if (!vm.value) {
      return ''
    }
    return join(global.Server.RedisDir, `redis-${vm.value}-default.conf`)
  })

  const names: CommonSetItem[] = [
    {
      name: 'port',
      value: '6379',
      enable: true,
      tips() {
        return I18nT('redis.port')
      }
    },
    {
      name: 'timeout',
      value: '0',
      enable: true,
      tips() {
        return I18nT('redis.timeout')
      }
    },
    {
      name: 'maxclients',
      value: '10000',
      enable: true,
      tips() {
        return I18nT('redis.maxclients')
      }
    },
    {
      name: 'databases',
      value: '16',
      enable: true,
      tips() {
        return I18nT('redis.databases')
      }
    },
    {
      name: 'requirepass',
      value: '',
      enable: true,
      tips() {
        return I18nT('redis.requirepass')
      }
    },
    {
      name: 'maxmemory',
      value: '0',
      enable: true,
      tips() {
        return I18nT('redis.maxmemory')
      }
    }
  ]
  let editConfig = ''
  let watcher: any

  const onSettingUpdate = () => {
    let config = editConfig
    const list = ['#PhpWebStudy-Conf-Common-Begin#']
    commonSetting.value.forEach((item) => {
      const regex = new RegExp(`([\\s\\n#]?[^\\n]*)${item.name}\\s+(.*?)([^\\n])(\\n|$)`, 'g')
      config = config.replace(regex, `\n\n`)
      if (item.enable) {
        list.push(`${item.name} ${item.value}`)
      }
    })
    list.push('#PhpWebStudy-Conf-Common-END#')
    config = config
      .replace(
        /([\s\n]?[^\n]*)#PhpWebStudy-Conf-Common-Begin#([\s\S]*?)#PhpWebStudy-Conf-Common-END#/g,
        ''
      )
      .replace(/\n+/g, '\n\n')
      .trim()
    config = `${list.join('\n')}\n` + config
    conf.value.setEditValue(config)
  }

  const getCommonSetting = () => {
    if (watcher) {
      watcher()
    }
    const arr = names
      .map((item) => {
        const regex = new RegExp(`([\\s\\n#]?[^\\n]*)${item.name}(.*?)([^\\n])(\\n|$)`, 'g')
        const matchs =
          editConfig.match(regex)?.map((s) => {
            const sarr = s
              .trim()
              .split(' ')
              .filter((s) => !!s.trim())
              .map((s) => s.trim())
            const k = sarr.shift()
            const v = sarr.join(' ').replace(';', '').replace('=', '').trim()
            return {
              k,
              v
            }
          }) ?? []
        console.log('getCommonSetting: ', matchs, item.name)
        const find = matchs?.find((m) => m.k === item.name)
        if (!find) {
          item.enable = false
          return item
        }
        item.enable = true
        item.value = find?.v ?? item.value
        return item
      })
      .filter((item) => item.show !== false)
    commonSetting.value = arr as any
    watcher = watch(commonSetting, debounce(onSettingUpdate, 500), {
      deep: true
    })
  }

  const onTypeChange = (type: 'default' | 'common', config: string) => {
    console.log('onTypeChange: ', type, config)
    if (editConfig !== config) {
      editConfig = config
      getCommonSetting()
    }
  }

  if (file.value && !existsSync(file.value)) {
    IPC.send('app-fork:redis', 'initConf', {
      version: currentVersion.value
    }).then((key: string) => {
      IPC.off(key)
      conf?.value?.update()
    })
  }
</script>
