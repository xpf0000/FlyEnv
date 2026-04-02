<template>
  <Conf
    ref="conf"
    :type-flag="'rustfs'"
    :show-load-default="false"
    :file="file"
    :file-ext="'conf'"
    :show-commond="true"
    url="https://github.com/rustfs/rustfs"
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
  const index = ref(1)
  const file = computed(() => {
    if (index.value < 0) {
      return ''
    }
    return join(window.Server.BaseDir!, 'rustfs/rustfs.conf')
  })

  const names: CommonSetItem[] = [
    {
      name: 'RUSTFS_ADDRESS',
      value: ':9000',
      enable: false,
      type: 'Network',
      isString: true,
      tips() {
        return I18nT('rustfs.RUSTFS_ADDRESS')
      }
    },
    {
      name: 'RUSTFS_ACCESS_KEY',
      value: '',
      enable: false,
      type: 'Security',
      isString: true,
      tips() {
        return I18nT('rustfs.RUSTFS_ACCESS_KEY')
      }
    },
    {
      name: 'RUSTFS_ACCESS_KEY_FILE',
      value: '',
      enable: false,
      type: 'Security',
      isString: true,
      isFile: true,
      tips() {
        return I18nT('rustfs.RUSTFS_ACCESS_KEY_FILE')
      }
    },
    {
      name: 'RUSTFS_SECRET_KEY',
      value: '',
      enable: false,
      type: 'Security',
      isString: true,
      tips() {
        return I18nT('rustfs.RUSTFS_SECRET_KEY')
      }
    },
    {
      name: 'RUSTFS_SECRET_KEY_FILE',
      value: '',
      enable: false,
      type: 'Security',
      isString: true,
      isFile: true,
      tips() {
        return I18nT('rustfs.RUSTFS_SECRET_KEY_FILE')
      }
    },
    {
      name: 'RUSTFS_CONSOLE_ENABLE',
      value: 'true',
      enable: false,
      type: 'General',
      options: [
        { label: 'true', value: 'true' },
        { label: 'false', value: 'false' }
      ],
      tips() {
        return I18nT('rustfs.RUSTFS_CONSOLE_ENABLE')
      }
    },
    {
      name: 'RUSTFS_CONSOLE_ADDRESS',
      value: ':9001',
      enable: false,
      type: 'Network',
      isString: true,
      tips() {
        return I18nT('rustfs.RUSTFS_CONSOLE_ADDRESS')
      }
    },
    {
      name: 'RUSTFS_SERVER_DOMAINS',
      value: '',
      enable: false,
      type: 'Network',
      isString: true,
      tips() {
        return I18nT('rustfs.RUSTFS_SERVER_DOMAINS')
      }
    },
    {
      name: 'RUSTFS_TLS_PATH',
      value: '',
      enable: false,
      type: 'Security',
      isString: true,
      isDir: true,
      tips() {
        return I18nT('rustfs.RUSTFS_TLS_PATH')
      }
    },
    {
      name: 'RUSTFS_REGION',
      value: '',
      enable: false,
      type: 'General',
      isString: true,
      tips() {
        return I18nT('rustfs.RUSTFS_REGION')
      }
    },
    {
      name: 'RUSTFS_LICENSE',
      value: '',
      enable: false,
      type: 'General',
      isString: true,
      tips() {
        return I18nT('rustfs.RUSTFS_LICENSE')
      }
    },
    {
      name: 'RUSTFS_KMS_ENABLE',
      value: 'false',
      enable: false,
      type: 'Security',
      options: [
        { label: 'true', value: 'true' },
        { label: 'false', value: 'false' }
      ],
      tips() {
        return I18nT('rustfs.RUSTFS_KMS_ENABLE')
      }
    },
    {
      name: 'RUSTFS_KMS_BACKEND',
      value: 'local',
      enable: false,
      type: 'Security',
      options: [
        { label: 'local', value: 'local' },
        { label: 'vault', value: 'vault' }
      ],
      tips() {
        return I18nT('rustfs.RUSTFS_KMS_BACKEND')
      }
    },
    {
      name: 'RUSTFS_KMS_KEY_DIR',
      value: '',
      enable: false,
      type: 'Security',
      isString: true,
      isDir: true,
      tips() {
        return I18nT('rustfs.RUSTFS_KMS_KEY_DIR')
      }
    },
    {
      name: 'RUSTFS_KMS_VAULT_ADDRESS',
      value: '',
      enable: false,
      type: 'Security',
      isString: true,
      tips() {
        return I18nT('rustfs.RUSTFS_KMS_VAULT_ADDRESS')
      }
    },
    {
      name: 'RUSTFS_KMS_VAULT_TOKEN',
      value: '',
      enable: false,
      type: 'Security',
      isString: true,
      tips() {
        return I18nT('rustfs.RUSTFS_KMS_VAULT_TOKEN')
      }
    },
    {
      name: 'RUSTFS_KMS_DEFAULT_KEY_ID',
      value: '',
      enable: false,
      type: 'Security',
      isString: true,
      tips() {
        return I18nT('rustfs.RUSTFS_KMS_DEFAULT_KEY_ID')
      }
    },
    {
      name: 'RUSTFS_OBS_ENDPOINT',
      value: '',
      enable: false,
      type: 'Advanced',
      isString: true,
      tips() {
        return I18nT('rustfs.RUSTFS_OBS_ENDPOINT')
      }
    },
    {
      name: 'RUSTFS_BUFFER_PROFILE_DISABLE',
      value: 'false',
      enable: false,
      type: 'Performance',
      options: [
        { label: 'true', value: 'true' },
        { label: 'false', value: 'false' }
      ],
      tips() {
        return I18nT('rustfs.RUSTFS_BUFFER_PROFILE_DISABLE')
      }
    },
    {
      name: 'RUSTFS_BUFFER_PROFILE',
      value: 'GeneralPurpose',
      enable: false,
      type: 'Performance',
      options: [
        { label: 'GeneralPurpose', value: 'GeneralPurpose' },
        { label: 'AiTraining', value: 'AiTraining' },
        { label: 'DataAnalytics', value: 'DataAnalytics' },
        { label: 'WebWorkload', value: 'WebWorkload' },
        { label: 'IndustrialIoT', value: 'IndustrialIoT' },
        { label: 'SecureStorage', value: 'SecureStorage' }
      ],
      tips() {
        return I18nT('rustfs.RUSTFS_BUFFER_PROFILE')
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
        const value = `${item.name}=${item.value}`
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
    if (editConfig !== config || commonSetting.value.length === 0) {
      editConfig = config
      getCommonSetting()
    }
  }
  fs.existsSync(file.value).then((e) => {
    if (!e) {
      IPC.send('app-fork:rustfs', 'initConfig').then((key: string) => {
        IPC.off(key)
        index.value += 1
        conf?.value?.update()
      })
    }
  })
</script>
