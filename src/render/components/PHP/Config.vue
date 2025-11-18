<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    :close-on-click-modal="false"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav pl-3 pr-5">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3 title truncate"
            >php.ini - {{ version.version }} - {{ version.path }}</span
          >
        </div>
      </div>

      <Conf
        ref="conf"
        :type-flag="'php'"
        :default-file="defaultFile"
        :file="file"
        :file-ext="'ini'"
        :show-commond="true"
        :version="version"
        @on-type-change="onTypeChange"
      >
        <template #common>
          <Common :setting="commonSetting" />
        </template>
      </Conf>
    </div>
  </el-drawer>
</template>
<script lang="ts" setup>
  import { computed, ref, watch, Ref, reactive } from 'vue'
  import Conf from '@/components/Conf/drawer.vue'
  import Common from '@/components/Conf/common.vue'
  import { type CommonSetItem, ConfStore } from '@/components/Conf/setup'
  import { I18nT } from '@lang/index'
  import { debounce } from 'lodash-es'
  import { SoftInstalled } from '@/store/brew'
  import IPC from '@/util/IPC'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { uuid } from '@/util/Index'
  import { join } from '@/util/path-browserify'
  import { IniParse } from '@/util/IniParse'
  import { asyncComputed } from '@vueuse/core'

  const props = defineProps<{
    version: SoftInstalled
  }>()

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const flag = computed(() => {
    return props?.version?.phpBin ?? props?.version?.path
  })

  const conf = ref()
  const commonSetting: Ref<CommonSetItem[]> = ref([])

  const fetchIniFile = () => {
    return new Promise((resolve) => {
      IPC.send('app-fork:php', 'getIniPath', JSON.parse(JSON.stringify(props.version))).then(
        (key: string, res: any) => {
          console.log(res)
          IPC.off(key)
          if (res.code === 0) {
            ConfStore.phpIniFiles[flag.value] = res.data
            ConfStore.save()
            resolve(res.data)
            return
          }
          resolve('')
        }
      )
    })
  }

  const file = asyncComputed(async () => {
    if (ConfStore.phpIniFiles?.[flag?.value]) {
      return ConfStore.phpIniFiles?.[flag?.value]
    }
    return await fetchIniFile()
  })
  const defaultFile = computed(() => {
    if (!file.value) {
      return ''
    }
    return `${file.value}.default`
  })
  const cacert = join(window.Server.BaseDir!, 'CA/cacert.pem')
  const names: CommonSetItem[] = [
    {
      section: 'PHP',
      name: 'log_errors',
      value: 'On',
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
        return I18nT('php.log_errors')
      }
    },
    {
      section: 'PHP',
      name: 'error_log',
      isFile: true,
      value: '',
      enable: true,
      tips() {
        return I18nT('php.error_log_dir')
      }
    },
    {
      section: 'PHP',
      name: 'display_errors',
      value: 'On',
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
        return I18nT('php.display_errors')
      }
    },
    {
      section: 'PHP',
      name: 'short_open_tag',
      value: 'On',
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
        return I18nT('php.short_open_tag')
      }
    },
    {
      section: 'PHP',
      name: 'file_uploads',
      value: 'On',
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
        return I18nT('php.file_uploads')
      }
    },
    {
      section: 'PHP-CGI',
      name: 'cgi.fix_pathinfo',
      value: '1',
      enable: true,
      options: [
        {
          value: '0',
          label: '0'
        },
        {
          value: '1',
          label: '1'
        }
      ],
      tips() {
        return I18nT('php.fix_pathinfo')
      }
    },
    {
      section: 'PHP',
      name: 'max_execution_time',
      value: '300',
      enable: true,
      tips() {
        return I18nT('php.max_execution_time')
      }
    },
    {
      section: 'PHP',
      name: 'max_input_time',
      value: '60',
      enable: true,
      tips() {
        return I18nT('php.max_input_time')
      }
    },
    {
      section: 'PHP',
      name: 'memory_limit',
      value: '128M',
      enable: true,
      tips() {
        return I18nT('php.memory_limit')
      }
    },
    {
      section: 'PHP',
      name: 'post_max_size',
      value: '20M',
      enable: true,
      tips() {
        return I18nT('php.post_max_size')
      }
    },
    {
      section: 'PHP',
      name: 'upload_max_filesize',
      value: '20M',
      enable: true,
      tips() {
        return I18nT('php.upload_max_filesize')
      }
    },
    {
      section: 'PHP',
      name: 'max_file_uploads',
      value: '20',
      enable: true,
      tips() {
        return I18nT('php.max_file_uploads')
      }
    },
    {
      section: 'PHP',
      name: 'default_socket_timeout',
      value: '60',
      enable: true,
      tips() {
        return I18nT('php.default_socket_timeout')
      }
    },
    {
      section: 'PHP',
      name: 'error_reporting',
      value: 'E_ALL & ~E_NOTICE',
      enable: true,
      tips() {
        return I18nT('php.error_reporting')
      }
    },
    {
      section: 'PHP',
      name: 'date.timezone',
      value: 'PRC',
      enable: true,
      tips() {
        return I18nT('php.timezone')
      }
    },
    {
      section: 'curl',
      name: 'curl.cainfo',
      value: `"${cacert}"`,
      enable: true,
      isFile: true,
      tips() {
        return `curl.cainfo. can found in ${cacert}`
      },
      pathHandler(dir) {
        return `"${dir}"`
      }
    },
    {
      section: 'openssl',
      name: 'openssl.cafile',
      value: `"${cacert}"`,
      enable: true,
      isFile: true,
      tips() {
        return `openssl.cafile. can found in ${cacert}`
      },
      pathHandler(dir) {
        return `"${dir}"`
      }
    }
  ]
  let editConfig = ''
  let watcher: any

  const onSettingUpdate = () => {
    const parse = new IniParse(editConfig)
    commonSetting.value.forEach((item) => {
      if (item.enable) {
        let value = ''
        if (item.isString || item.isFile || item.isDir) {
          value = `${item.name} = "${item.value}"`
        } else {
          value = `${item.name} = ${item.value}`
        }
        parse.set(item.name, value, item?.section)
      } else {
        parse.remove(item.name)
      }
    })
    conf.value.setEditValue(parse.content)
    editConfig = parse.content
  }

  const getCommonSetting = () => {
    if (watcher) {
      watcher()
    }
    const parse = new IniParse(editConfig)
    const arr = [...names]
      .map((item) => {
        const find = parse.get(item.name)
        let value = find ?? item.value
        if (item.isString) {
          value = value.replace(new RegExp(`"`, 'g'), '').replace(new RegExp(`'`, 'g'), '')
        }
        item.enable = typeof find === 'string'
        item.value = value
        item.key = uuid()
        return item
      })
      .filter((item) => item.show !== false)
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

  IPC.send('app-fork:php', 'initCACertPEM').then((key: string) => {
    IPC.off(key)
  })

  defineExpose({ show, onClosed, onSubmit, closedFn })
</script>
