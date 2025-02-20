<template>
  <Conf
    ref="conf"
    :type-flag="'ollama'"
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
  import { computed, Ref, ref, watch } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import IPC from '@/util/IPC'
  import type { CommonSetItem } from '@/components/Conf/setup'
  import { I18nT } from '@shared/lang'
  import { debounce } from 'lodash'
  import Common from '@/components/Conf/common.vue'

  const { join } = require('path')
  const { existsSync } = require('fs-extra')

  const commonSetting: Ref<CommonSetItem[]> = ref([])
  const conf = ref()
  const file = computed(() => {
    return join(global.Server.BaseDir, 'ollama/ollama.conf')
  })
  const defaultFile = computed(() => {
    return join(global.Server.BaseDir, 'ollama/ollama.conf.default')
  })

  const names: CommonSetItem[] = [
    {
      name: 'OLLAMA_DEBUG',
      value: '',
      enable: false,

      tips() {
        return I18nT('ollama.OLLAMA_DEBUG')
      }
    },
    {
      name: 'OLLAMA_HOST',
      value: '',
      enable: false,

      tips() {
        return I18nT('ollama.OLLAMA_HOST')
      }
    },
    {
      name: 'OLLAMA_KEEP_ALIVE',
      value: '',
      enable: false,

      tips() {
        return I18nT('ollama.OLLAMA_KEEP_ALIVE')
      }
    },
    {
      name: 'OLLAMA_MAX_LOADED_MODELS',
      value: '',
      enable: false,

      tips() {
        return I18nT('ollama.OLLAMA_MAX_LOADED_MODELS')
      }
    },
    {
      name: 'OLLAMA_MAX_QUEUE',
      value: '',
      enable: false,

      tips() {
        return I18nT('ollama.OLLAMA_MAX_QUEUE')
      }
    },
    {
      name: 'OLLAMA_MODELS',
      value: '',
      enable: false,

      tips() {
        return I18nT('ollama.OLLAMA_MODELS')
      }
    },
    {
      name: 'OLLAMA_NUM_PARALLEL',
      value: '',
      enable: false,

      tips() {
        return I18nT('ollama.OLLAMA_NUM_PARALLEL')
      }
    },
    {
      name: 'OLLAMA_NOPRUNE',
      value: '',
      enable: false,

      tips() {
        return I18nT('ollama.OLLAMA_NOPRUNE')
      }
    },
    {
      name: 'OLLAMA_ORIGINS',
      value: '',
      enable: false,

      tips() {
        return I18nT('ollama.OLLAMA_ORIGINS')
      }
    },
    {
      name: 'OLLAMA_SCHED_SPREAD',
      value: '',
      enable: false,

      tips() {
        return I18nT('ollama.OLLAMA_SCHED_SPREAD')
      }
    },
    {
      name: 'OLLAMA_FLASH_ATTENTION',
      value: '',
      enable: false,

      tips() {
        return I18nT('ollama.OLLAMA_FLASH_ATTENTION')
      }
    },
    {
      name: 'OLLAMA_KV_CACHE_TYPE',
      value: '',
      enable: false,

      tips() {
        return I18nT('ollama.OLLAMA_KV_CACHE_TYPE')
      }
    },
    {
      name: 'OLLAMA_LLM_LIBRARY',
      value: '',
      enable: false,

      tips() {
        return I18nT('ollama.OLLAMA_LLM_LIBRARY')
      }
    },
    {
      name: 'OLLAMA_GPU_OVERHEAD',
      value: '',
      enable: false,

      tips() {
        return I18nT('ollama.OLLAMA_GPU_OVERHEAD')
      }
    },
    {
      name: 'OLLAMA_LOAD_TIMEOUT',
      value: '',
      enable: false,

      tips() {
        return I18nT('ollama.OLLAMA_LOAD_TIMEOUT')
      }
    }
  ]
  let editConfig = ''
  let watcher: any

  const onSettingUpdate = () => {
    let config = editConfig
    const list = ['#PhpWebStudy-Conf-Common-Begin#']
    commonSetting.value.forEach((item) => {
      const regex = new RegExp(`([\\s\\n#]?[^\\n]*)${item.name}(.*?)([^\\n])(\\n|$)`, 'g')
      config = config.replace(regex, `\n\n`)
      if (item.enable) {
        list.push(`${item.name}=${item.value}`)
      }
    })
    list.push('#PhpWebStudy-Conf-Common-END#')
    config = config
      .replace(/#PhpWebStudy-Conf-Common-Begin#([\s\S]*?)#PhpWebStudy-Conf-Common-END#/g, '')
      .replace(/\n+/g, '\n')
      .trim()
    config = `${list.join('\n')}\n` + config
    conf.value.setEditValue(config)
  }

  const getCommonSetting = () => {
    if (watcher) {
      watcher()
    }
    const arr = names.map((item) => {
      const regex = new RegExp(`([\\s\\n#]?[^\\n]*)${item.name}(.*?)([^\\n])(\\n|$)`, 'g')
      const matchs =
        editConfig.match(regex)?.map((s) => {
          const sarr = s
            .trim()
            .split('=')
            .filter((s) => !!s.trim())
            .map((s) => s.trim())
          const k = sarr.shift()
          const v = sarr.join(' ')
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

  if (!existsSync(file.value)) {
    IPC.send('app-fork:ollama', 'initConfig').then((key: string) => {
      IPC.off(key)
      conf?.value?.update()
    })
  }
</script>
