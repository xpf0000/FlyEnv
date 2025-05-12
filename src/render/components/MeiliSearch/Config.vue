<template>
  <Conf
    ref="conf"
    :type-flag="'meilisearch'"
    :default-file="defaultFile"
    :file="file"
    :file-ext="'conf'"
    :show-commond="true"
    url="https://meilisearch.axllent.org/docs/configuration/runtime-options/"
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
  import { debounce } from 'lodash'
  import Common from '@/components/Conf/common.vue'
  import { uuid } from '@shared/utils'

  const { join } = require('path')
  const { existsSync } = require('fs-extra')

  const commonSetting: Ref<CommonSetItem[]> = ref([])
  const conf = ref()
  const index = ref(1)
  const file = computed(() => {
    if (index.value < 0) {
      return ''
    }
    return join(global.Server.BaseDir, 'meilisearch/meilisearch.toml')
  })
  const defaultFile = computed(() => {
    if (index.value < 0) {
      return ''
    }
    return join(global.Server.BaseDir, 'meilisearch/meilisearch.default.toml')
  })

  const names: CommonSetItem[] = [
    {
      name: 'MP_DATABASE',
      value: '',
      enable: false,
      type: 'General',
      tips() {
        return I18nT('meilisearch.MP_DATABASE')
      }
    },
    {
      name: 'MP_LABEL',
      value: '',
      enable: false,
      type: 'General',
      tips() {
        return I18nT('meilisearch.MP_LABEL')
      }
    },
    {
      name: 'MP_TENANT_ID',
      value: '',
      enable: false,
      type: 'General',
      tips() {
        return I18nT('meilisearch.MP_TENANT_ID')
      }
    },
    {
      name: 'MP_MAX_MESSAGES',
      value: '500',
      enable: true,
      type: 'General',
      tips() {
        return I18nT('meilisearch.MP_MAX_MESSAGES')
      }
    },
    {
      name: 'MP_MAX_AGE',
      value: '',
      enable: false,
      type: 'General',
      tips() {
        return I18nT('meilisearch.MP_MAX_AGE')
      }
    },
    {
      name: 'MP_USE_MESSAGE_DATES',
      value: 'false',
      enable: true,
      options: [
        { value: 'false', label: 'false' },
        { value: 'true', label: 'true' }
      ],
      type: 'General',
      tips() {
        return I18nT('meilisearch.MP_USE_MESSAGE_DATES')
      }
    },
    {
      name: 'MP_IGNORE_DUPLICATE_IDS',
      value: 'false',
      enable: true,
      options: [
        { value: 'false', label: 'false' },
        { value: 'true', label: 'true' }
      ],
      type: 'General',
      tips() {
        return I18nT('meilisearch.MP_IGNORE_DUPLICATE_IDS')
      }
    },
    {
      name: 'MP_LOG_FILE',
      value: '',
      enable: false,
      isFile: true,
      type: 'General',
      tips() {
        return I18nT('meilisearch.MP_LOG_FILE')
      }
    },
    {
      name: 'MP_QUIET',
      value: 'false',
      enable: true,
      options: [
        { value: 'false', label: 'false' },
        { value: 'true', label: 'true' }
      ],
      type: 'General',
      tips() {
        return I18nT('meilisearch.MP_QUIET')
      }
    },
    {
      name: 'MP_VERBOSE',
      value: 'false',
      enable: true,
      options: [
        { value: 'false', label: 'false' },
        { value: 'true', label: 'true' }
      ],
      type: 'General',
      tips() {
        return I18nT('meilisearch.MP_VERBOSE')
      }
    }
  ]
  let editConfig = ''
  let watcher: any

  const onSettingUpdate = () => {
    let config = editConfig.replace(/\r\n/gm, '\n')
    const list = ['#FlyEnv-Conf-Common-Begin#']
    commonSetting.value.forEach((item) => {
      const regex = new RegExp(`^[\\s\\n#]?([\\s#]*?)${item.name}(.*?)([^\\n])(\\n|$)`, 'gm')
      config = config.replace(regex, `\n\n`)
      if (item.enable) {
        list.push(`${item.name}=${item.value}`)
      }
    })
    list.push('#FlyEnv-Conf-Common-END#')
    config = config
      .replace(/#FlyEnv-Conf-Common-Begin#([\s\S]*?)#FlyEnv-Conf-Common-END#/g, '')
      .replace(/\n+/g, '\n')
      .trim()
    config = `${list.join('\n')}\n` + config
    conf.value.setEditValue(config)
    editConfig = config
  }

  const getCommonSetting = () => {
    if (watcher) {
      watcher()
    }
    let config = editConfig.replace(/\r\n/gm, '\n')
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
      item.enable = !!find
      item.value = find?.v ?? item.value
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
    }
  }

  if (!existsSync(file.value)) {
    IPC.send('app-fork:meilisearch', 'initConfig').then((key: string) => {
      IPC.off(key)
      index.value += 1
      conf?.value?.update()
    })
  }
</script>
