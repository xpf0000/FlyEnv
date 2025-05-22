<template>
  <Conf
    ref="conf"
    :type-flag="'apache'"
    :default-file="defaultFile"
    :file="file"
    :file-ext="'conf'"
    :show-commond="true"
    :common-setting="commonSetting"
    @on-type-change="onTypeChange"
  >
  </Conf>
</template>

<script lang="ts" setup>
  import { computed, ref, watch, Ref, reactive } from 'vue'
  import { AppStore } from '@/store/app'
  import Conf from '@/components/Conf/index.vue'
  import type { CommonSetItem } from '@/components/Conf/setup'
  import { I18nT } from '@lang/index'
  import { debounce } from 'lodash'
  import { uuid } from '@shared/utils'

  const { join } = require('path')

  const conf = ref()
  const commonSetting: Ref<CommonSetItem[]> = ref([])
  const appStore = AppStore()
  const version = computed(() => {
    return appStore.config.server?.apache?.current
  })
  const file = computed(() => {
    if (!version?.value || !version?.value?.bin) {
      return ''
    }
    return join(global.Server.ApacheDir, `${version.value.version}.conf`)
  })
  const defaultFile = computed(() => {
    if (!version?.value || !version?.value?.bin) {
      return ''
    }
    return join(global.Server.ApacheDir, `${version.value.version}.default.conf`)
  })

  const names: CommonSetItem[] = [
    {
      name: 'Timeout',
      value: '60',
      enable: true,
      tips() {
        return I18nT('apache.Timeout')
      }
    },
    {
      name: 'KeepAlive',
      value: 'Off',
      enable: true,
      options: [
        {
          value: 'Off',
          label: 'Off'
        },
        {
          value: 'On',
          label: 'On'
        }
      ],
      tips() {
        return I18nT('apache.KeepAlive')
      }
    },
    {
      name: 'KeepAliveTimeout',
      value: '15',
      enable: true,
      tips() {
        return I18nT('apache.KeepAliveTimeout')
      }
    },
    {
      name: 'MaxKeepAliveRequests',
      value: '1000',
      enable: true,
      tips() {
        return I18nT('apache.MaxKeepAliveRequests')
      }
    },
    {
      name: 'LimitRequestBody',
      value: '0',
      enable: true,
      tips() {
        return I18nT('apache.LimitRequestBody')
      }
    }
  ]
  let editConfig = ''
  let watcher: any

  const onSettingUpdate = () => {
    let config = editConfig.replace(/\r\n/gm, '\n')
    commonSetting.value.forEach((item) => {
      const regex = new RegExp(`^[\\s\\n#]?([\\s#]*?)${item.name}\\s+(.*?)([^\\n])(\\n|$)`, 'gm')
      if (item.enable) {
        let value = ''
        if (item.isString) {
          value = `${item.name} "${item.value}"`
        } else {
          value = `${item.name} ${item.value}`
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
    let config = editConfig.replace(/\r\n/gm, '\n')
    const arr = [...names].map((item) => {
      const regex = new RegExp(
        `^[\\s\\n]?((?!#)([\\s]*?))${item.name}\\s+(.*?)([^\\n])(\\n|$)`,
        'gm'
      )
      const matchs =
        config.match(regex)?.map((s) => {
          const sarr = s
            .trim()
            .split(' ')
            .filter((s) => !!s.trim())
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
    if (editConfig !== config || commonSetting.value.length === 0) {
      editConfig = config
      getCommonSetting()
    }
  }
</script>
