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
      <div class="nav">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-15 title">{{ version.version }} - {{ version.path }} - php.ini</span>
        </div>
      </div>

      <Conf
        ref="conf"
        :type-flag="'php'"
        :default-file="defaultFile"
        :file="file"
        :file-ext="'ini'"
        :show-commond="true"
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
  import { computed, ref, watch, Ref } from 'vue'
  import Conf from '@/components/Conf/drawer.vue'
  import Common from '@/components/Conf/common.vue'
  import { type CommonSetItem, ConfStore } from '@/components/Conf/setup'
  import { I18nT } from '@shared/lang'
  import { debounce } from 'lodash'
  import { SoftInstalled } from '@/store/brew'
  import IPC from '@/util/IPC'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'

  const props = defineProps<{
    version: SoftInstalled
  }>()

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const flag = computed(() => {
    return props?.version?.phpBin ?? props?.version?.path
  })

  const conf = ref()
  const commonSetting: Ref<CommonSetItem[]> = ref([])
  const file = computed(() => {
    return ConfStore.phpIniFiles?.[flag?.value] ?? ''
  })
  const defaultFile = computed(() => {
    if (!file.value) {
      return ''
    }
    return `${file.value}.default`
  })

  const names: CommonSetItem[] = [
    {
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
      name: 'max_execution_time',
      value: '300',
      enable: true,
      tips() {
        return I18nT('php.max_execution_time')
      }
    },
    {
      name: 'max_input_time',
      value: '60',
      enable: true,
      tips() {
        return I18nT('php.max_input_time')
      }
    },
    {
      name: 'memory_limit',
      value: '128M',
      enable: true,
      tips() {
        return I18nT('php.memory_limit')
      }
    },
    {
      name: 'post_max_size',
      value: '20M',
      enable: true,
      tips() {
        return I18nT('php.post_max_size')
      }
    },
    {
      name: 'upload_max_filesize',
      value: '20M',
      enable: true,
      tips() {
        return I18nT('php.upload_max_filesize')
      }
    },
    {
      name: 'max_file_uploads',
      value: '20',
      enable: true,
      tips() {
        return I18nT('php.max_file_uploads')
      }
    },
    {
      name: 'default_socket_timeout',
      value: '60',
      enable: true,
      tips() {
        return I18nT('php.default_socket_timeout')
      }
    },
    {
      name: 'error_reporting',
      value: 'E_ALL & ~E_NOTICE',
      enable: true,
      tips() {
        return I18nT('php.error_reporting')
      }
    },
    {
      name: 'date.timezone',
      value: 'PRC',
      enable: true,
      tips() {
        return I18nT('php.timezone')
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
        list.push(`${item.name} = ${item.value}`)
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

  if (flag.value && !file.value) {
    IPC.send('app-fork:php', 'getIniPath', JSON.parse(JSON.stringify(props.version))).then(
      (key: string, res: any) => {
        console.log(res)
        IPC.off(key)
        if (res.code === 0) {
          ConfStore.phpIniFiles[flag.value] = res.data
          ConfStore.save()
        }
      }
    )
  }

  defineExpose({ show, onClosed, onSubmit, closedFn })
</script>
