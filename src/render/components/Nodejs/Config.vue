<template>
  <Conf
    ref="conf"
    :type-flag="'node'"
    :file="file"
    :file-ext="'conf'"
    :show-commond="true"
    :show-load-default="false"
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
  import Common from '@/components/Conf/common.vue'
  import type { CommonSetItem } from '@/components/Conf/setup'
  import { I18nT } from '@shared/lang'
  import { debounce } from 'lodash'

  const { join } = require('path')

  const commonSetting: Ref<CommonSetItem[]> = ref([])
  const conf = ref()
  const file = computed(() => {
    return join(global.Server.UserHome!, '.npmrc')
  })

  const names: CommonSetItem[] = [
    {
      name: 'registry',
      value: 'npm',
      showEnable: false,
      enable: true,
      options: [
        {
          value: 'https://registry.npmjs.org/',
          label: 'npm'
        },
        {
          value: 'https://registry.yarnpkg.com/',
          label: 'yarn'
        },
        {
          value: 'https://mirrors.tencent.com/npm/',
          label: 'tencent'
        },
        {
          value: 'https://r.cnpmjs.org/',
          label: 'cnpm'
        },
        {
          value: 'https://registry.npmmirror.com/',
          label: 'taobao'
        },
        {
          value: 'https://skimdb.npmjs.com/registry/',
          label: 'npmMirror'
        },
        {
          value: 'https://repo.huaweicloud.com/repository/npm/',
          label: 'huawei'
        }
      ],
      tips() {
        return I18nT('nodejs.registry')
      }
    }
  ]
  let editConfig = ''
  let watcher: any

  const registrys = [
    'https://registry.npmjs.org/',
    'https://registry.yarnpkg.com/',
    'https://mirrors.tencent.com/npm/',
    'https://r.cnpmjs.org/',
    'https://registry.npmmirror.com/',
    'https://skimdb.npmjs.com/registry/',
    'https://repo.huaweicloud.com/repository/npm/'
  ]

  const onSettingUpdate = () => {
    let config = editConfig
    commonSetting.value.forEach((item) => {
      const regex = new RegExp(`^(?!\\s*#)\\s*${item.name}\\s*=(.*?)([^\\n])(\\n|$)`, 'gmu')
      if (item.enable) {
        console.log(config.match(regex))
        config = config.replace(regex, `${item.name}=${item.value}\n`)
      } else {
        config = config.replace(regex, `\n`)
        config = config.replace(/^\s*[\r\n]+|[\r\n]+\s*$/gm, '\n').replace(/\n\s*\n/g, '\n')
      }
      if (item.name === 'registry') {
        registrys.forEach((s) => {
          if (s !== item.value) {
            config = config.replace(new RegExp(s, 'g'), item.value)
          }
        })
      }
    })
    config = config.trim()
    conf.value.setEditValue(config)
  }

  const getCommonSetting = () => {
    if (watcher) {
      watcher()
    }
    const arr = names.map((item) => {
      const regex = new RegExp(`^(?!\\s*#)\\s*${item.name}\\s*=(.*?)([^\\n])(\\n|$)`, 'gmu')
      const matchs =
        editConfig.match(regex)?.map((s) => {
          const sarr = s
            .trim()
            .split('=')
            .filter((s) => !!s.trim())
          const k = sarr.shift()
          const v = sarr.join('')
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
</script>
