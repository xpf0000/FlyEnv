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
  import { computed, reactive, Ref, ref, watch } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import IPC from '@/util/IPC'
  import type { CommonSetItem } from '@/components/Conf/setup'
  import { I18nT } from '@lang/index'
  import { debounce } from 'lodash-es'
  import Common from '@/components/Conf/common.vue'
  import { uuid } from '@/util/Index'
  import { join } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'

  const commonSetting: Ref<CommonSetItem[]> = ref([])
  const conf = ref()
  const file = computed(() => {
    return join(window.Server.BaseDir!, 'ollama/ollama.conf')
  })
  const defaultFile = computed(() => {
    return join(window.Server.BaseDir!, 'ollama/ollama.conf.default')
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
      value: '0.0.0.0:11434',
      enable: false,
      show: false,
      tips() {
        return I18nT('ollama.OLLAMA_HOST')
      }
    },
    {
      name: 'OLLAMA_KEEP_ALIVE',
      value: '5m',
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
      value: 'f16',
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
      value: '5m',
      enable: false,
      tips() {
        return I18nT('ollama.OLLAMA_LOAD_TIMEOUT')
      }
    }
  ]
  let editConfig = ''
  let watcher: any

  const onSettingUpdate = () => {
    let config = editConfig.replace(/\r\n/gm, '\n')
    commonSetting.value.forEach((item) => {
      const regex = new RegExp(`^[\\s\\n#]?([\\s#]*?)${item.name}(.*?)([^\\n])(\\n|$)`, 'gm')
      if (item.enable) {
        let value = ''
        if (item.isString) {
          value = `${item.name}="${item.value}"`
        } else {
          value = `${item.name}=${item.value}`
        }
        if (regex.test(config)) {
          config = config.replace(regex, `${value}\n`)
        } else {
          config = `${value}\n` + config
        }
      } else {
        config = config.replace(regex, ``)
      }
    })
    conf.value.setEditValue(config)
    editConfig = config
  }

  const getCommonSetting = () => {
    if (watcher) {
      watcher()
    }
    const config = editConfig.replace(/\r\n/gm, '\n')
    console.log('config: ', config)
    const arr = [...names].map((item) => {
      const regex = new RegExp(`^[\\s\\n]?((?!#)([\\s]*?))${item.name}(.*?)([^\\n])(\\n|$)`, 'gm')
      const matchs =
        config.match(regex)?.map((s) => {
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
      let value = find?.v ?? item.value
      if (item.isString) {
        value = value.replace(new RegExp(`"`, 'g'), '').replace(new RegExp(`'`, 'g'), '')
      }
      item.enable = !!find
      item.value = value
      item.key = uuid()
      return item
    })
    commonSetting.value = reactive(arr) as any
    watcher = watch(commonSetting, debounce(onSettingUpdate, 500), {
      deep: true
    })
  }

  const onTypeChange = (type: 'default' | 'common', config: string) => {
    console.log('onTypeChange: ', type, config)
    if (editConfig !== config) {
      editConfig = config
      getCommonSetting()
    } else if (commonSetting.value.length === 0) {
      getCommonSetting()
    }
  }

  fs.existsSync(file.value).then((e) => {
    if (!e) {
      IPC.send('app-fork:ollama', 'initConfig').then((key: string) => {
        IPC.off(key)
        conf?.value?.update()
      })
    }
  })
</script>
