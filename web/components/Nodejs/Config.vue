<template>
  <Conf
    ref="conf"
    :type-flag="'node'"
    :conf="content"
    :file-ext="'npmrc'"
    :show-commond="true"
    :show-load-default="false"
    @on-type-change="onTypeChange"
  >
    <template #common>
      <Common :key="commonKey" :setting="commonSetting" />
    </template>
  </Conf>
</template>

<script lang="ts" setup>
  import { reactive, Ref, ref, watch } from 'vue'
  import Conf from '@web/components/Conf/index.vue'
  import Common from '@web/components/Conf/common.vue'
  import type { CommonSetItem } from '@web/components/Conf/setup'
  import { I18nT } from '@shared/lang'
  import { debounce } from 'lodash'
  import { uuid } from '@web/fn'

  const commonSetting: Ref<CommonSetItem[]> = ref([])
  const conf = ref()
  const content = ref('')
  import('@web/config/node.npmrc.txt?raw').then((res) => {
    content.value = res.default
  })

  const commonKey = ref(uuid())

  const baseOptions = [
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
  ]
  const names: CommonSetItem[] = [
    {
      name: 'registry',
      value: 'npm',
      enable: true,
      options: baseOptions,
      tips() {
        return I18nT('nodejs.registry')
      },
      onChange(nv: any, ov: any) {
        if (watcher) {
          watcher()
        }
        console.log('registry onChange: ', nv, ov)
        let config = editConfig
        registrys.forEach((s) => {
          if (s !== nv) {
            config = config.replace(new RegExp(s, 'g'), nv)
          }
        })
        config = config.trim()
        conf.value.setEditValue(config)
        editConfig = config
        getCommonSetting()
      }
    },
    {
      name: 'disturl',
      value: 'npm',
      enable: true,
      options: baseOptions.map((b) => {
        return {
          value: `${b.value}-/binary/node/`,
          label: b.label
        }
      }),
      tips() {
        return 'disturl'
      }
    },
    {
      name: 'sass_binary_site',
      value: 'npm',
      enable: true,
      options: baseOptions.map((b) => {
        return {
          value: `${b.value}node-sass`,
          label: b.label
        }
      }),
      tips() {
        return 'sass_binary_site'
      }
    },
    {
      name: 'phantomjs_cdnurl',
      value: 'npm',
      enable: true,
      options: baseOptions.map((b) => {
        return {
          value: `${b.value}phantomjs`,
          label: b.label
        }
      }),
      tips() {
        return 'phantomjs_cdnurl'
      }
    },
    {
      name: 'chromedriver_cdnurl',
      value: 'npm',
      enable: true,
      options: baseOptions.map((b) => {
        return {
          value: `${b.value}-/binary/chromedriver/`,
          label: b.label
        }
      }),
      tips() {
        return 'chromedriver_cdnurl'
      }
    },
    {
      name: 'operadriver_cdnurl',
      value: 'npm',
      enable: true,
      options: baseOptions.map((b) => {
        return {
          value: `${b.value}-/binary/operadriver/`,
          label: b.label
        }
      }),
      tips() {
        return 'operadriver_cdnurl'
      }
    },
    {
      name: 'electron_mirror',
      value: 'npm',
      enable: true,
      options: baseOptions.map((b) => {
        return {
          value: `${b.value}-/binary/electron/`,
          label: b.label
        }
      }),
      tips() {
        return 'electron_mirror'
      }
    },
    {
      name: 'electron_builder_binaries_mirror',
      value: 'npm',
      enable: true,
      options: baseOptions.map((b) => {
        return {
          value: `${b.value}-/binary/electron-builder-binaries/`,
          label: b.label
        }
      }),
      tips() {
        return 'electron_mirror'
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
        if (regex.test(config)) {
          config = config.replace(regex, `${item.name}=${item.value}\n`)
        } else {
          config = config.trim() + `\n${item.name}=${item.value}`
        }
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
    if (commonSetting.value.length === 0) {
      commonSetting.value = reactive(arr) as any
    } else {
      arr.forEach((item, index) => {
        const setting = commonSetting.value[index]
        setting.enable = item.enable
        setting.value = item.value
      })
    }
    commonKey.value = uuid()
    watcher = watch(commonSetting, debounce(onSettingUpdate, 500), {
      deep: true
    })
  }

  const onTypeChange = (type: 'default' | 'common', config: string) => {
    if (editConfig !== config) {
      editConfig = config
      getCommonSetting()
    }
  }
</script>
