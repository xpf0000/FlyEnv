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
      name: 'db_path',
      value: './data.ms',
      enable: false,
      type: 'General',
      isString: true,
      isDir: true,
      tips() {
        return I18nT('meilisearch.db_path')
      }
    },
    {
      name: 'env',
      value: 'development',
      enable: false,
      type: 'General',
      isString: true,
      options: [
        {
          label: 'development',
          value: 'development'
        },
        {
          label: 'production',
          value: 'production'
        }
      ],
      tips() {
        return I18nT('meilisearch.env')
      }
    },
    {
      name: 'http_addr',
      value: 'localhost:7700',
      enable: false,
      type: 'Network',
      isString: true,
      tips() {
        return I18nT('meilisearch.http_addr')
      }
    },
    {
      name: 'master_key',
      value: '',
      enable: false,
      type: 'Security',
      isString: true,
      tips() {
        return I18nT('meilisearch.master_key')
      }
    },
    {
      name: 'no_analytics',
      value: 'false',
      enable: false,
      type: 'General',
      options: [
        {
          label: 'false',
          value: 'false'
        },
        {
          label: 'true',
          value: 'true'
        }
      ],
      tips() {
        return I18nT('meilisearch.no_analytics')
      }
    },
    {
      name: 'http_payload_size_limit',
      value: '100 MB',
      enable: false,
      type: 'Network',
      isString: true,
      tips() {
        return I18nT('meilisearch.http_payload_size_limit')
      }
    },
    {
      name: 'log_level',
      value: 'INFO',
      enable: false,
      type: 'General',
      isString: true,
      options: [
        { label: 'OFF', value: 'OFF' },
        { label: 'ERROR', value: 'ERROR' },
        { label: 'WARN', value: 'WARN' },
        { label: 'INFO', value: 'INFO' },
        { label: 'DEBUG', value: 'DEBUG' },
        { label: 'TRACE', value: 'TRACE' }
      ],
      tips() {
        return I18nT('meilisearch.log_level')
      }
    },
    {
      name: 'max_indexing_memory',
      value: '2 GiB',
      enable: false,
      type: 'Performance',
      isString: true,
      tips() {
        return I18nT('meilisearch.max_indexing_memory')
      }
    },
    {
      name: 'max_indexing_threads',
      value: '4',
      enable: false,
      type: 'Performance',
      tips() {
        return I18nT('meilisearch.max_indexing_threads')
      }
    },
    {
      name: 'dump_dir',
      value: 'dumps/',
      enable: false,
      type: 'Backup',
      isString: true,
      isDir: true,
      tips() {
        return I18nT('meilisearch.dump_dir')
      }
    },
    {
      name: 'import_dump',
      value: '',
      enable: false,
      type: 'Backup',
      isString: true,
      isFile: true,
      tips() {
        return I18nT('meilisearch.import_dump')
      }
    },
    {
      name: 'ignore_missing_dump',
      value: 'false',
      enable: false,
      type: 'Backup',
      options: [
        {
          label: 'false',
          value: 'false'
        },
        {
          label: 'true',
          value: 'true'
        }
      ],
      tips() {
        return I18nT('meilisearch.ignore_missing_dump')
      }
    },
    {
      name: 'ignore_dump_if_db_exists',
      value: 'false',
      enable: false,
      type: 'Backup',
      options: [
        {
          label: 'false',
          value: 'false'
        },
        {
          label: 'true',
          value: 'true'
        }
      ],
      tips() {
        return I18nT('meilisearch.ignore_dump_if_db_exists')
      }
    },
    {
      name: 'schedule_snapshot',
      value: 'false',
      enable: false,
      type: 'Backup',
      options: [
        {
          label: 'false',
          value: 'false'
        },
        {
          label: 'true',
          value: 'true'
        }
      ],
      tips() {
        return I18nT('meilisearch.schedule_snapshot')
      }
    },
    {
      name: 'snapshot_dir',
      value: 'snapshots/',
      enable: false,
      type: 'Backup',
      isString: true,
      isDir: true,
      tips() {
        return I18nT('meilisearch.snapshot_dir')
      }
    },
    {
      name: 'import_snapshot',
      value: '',
      enable: false,
      type: 'Backup',
      isString: true,
      isFile: true,
      tips() {
        return I18nT('meilisearch.import_snapshot')
      }
    },
    {
      name: 'ignore_missing_snapshot',
      value: 'false',
      enable: false,
      type: 'Backup',
      options: [
        {
          label: 'false',
          value: 'false'
        },
        {
          label: 'true',
          value: 'true'
        }
      ],
      tips() {
        return I18nT('meilisearch.ignore_missing_snapshot')
      }
    },
    {
      name: 'ignore_snapshot_if_db_exists',
      value: 'false',
      enable: false,
      type: 'Backup',
      options: [
        {
          label: 'false',
          value: 'false'
        },
        {
          label: 'true',
          value: 'true'
        }
      ],
      tips() {
        return I18nT('meilisearch.ignore_snapshot_if_db_exists')
      }
    },
    {
      name: 'ssl_cert_path',
      value: '',
      enable: false,
      type: 'Security',
      isString: true,
      isFile: true,
      tips() {
        return I18nT('meilisearch.ssl_cert_path')
      }
    },
    {
      name: 'ssl_key_path',
      value: '',
      enable: false,
      type: 'Security',
      isString: true,
      isFile: true,
      tips() {
        return I18nT('meilisearch.ssl_key_path')
      }
    },
    {
      name: 'ssl_auth_path',
      value: '',
      enable: false,
      type: 'Security',
      isString: true,
      isDir: true,
      tips() {
        return I18nT('meilisearch.ssl_auth_path')
      }
    },
    {
      name: 'ssl_ocsp_path',
      value: '',
      enable: false,
      type: 'Security',
      isString: true,
      isFile: true,
      tips() {
        return I18nT('meilisearch.ssl_ocsp_path')
      }
    },
    {
      name: 'ssl_require_auth',
      value: 'false',
      enable: false,
      type: 'Security',
      options: [
        {
          label: 'false',
          value: 'false'
        },
        {
          label: 'true',
          value: 'true'
        }
      ],
      tips() {
        return I18nT('meilisearch.ssl_require_auth')
      }
    },
    {
      name: 'ssl_resumption',
      value: 'false',
      enable: false,
      type: 'Security',
      options: [
        {
          label: 'false',
          value: 'false'
        },
        {
          label: 'true',
          value: 'true'
        }
      ],
      tips() {
        return I18nT('meilisearch.ssl_resumption')
      }
    },
    {
      name: 'ssl_tickets',
      value: 'false',
      enable: false,
      type: 'Security',
      options: [
        {
          label: 'false',
          value: 'false'
        },
        {
          label: 'true',
          value: 'true'
        }
      ],
      tips() {
        return I18nT('meilisearch.ssl_tickets')
      }
    },
    {
      name: 'experimental_enable_metrics',
      value: 'false',
      enable: false,
      type: 'Experimental',
      options: [
        {
          label: 'false',
          value: 'false'
        },
        {
          label: 'true',
          value: 'true'
        }
      ],
      tips() {
        return I18nT('meilisearch.experimental_enable_metrics')
      }
    },
    {
      name: 'experimental_reduce_indexing_memory_usage',
      value: 'false',
      enable: false,
      type: 'Experimental',
      options: [
        {
          label: 'false',
          value: 'false'
        },
        {
          label: 'true',
          value: 'true'
        }
      ],
      tips() {
        return I18nT('meilisearch.experimental_reduce_indexing_memory_usage')
      }
    },
    {
      name: 'experimental_max_number_of_batched_tasks',
      value: '100',
      enable: false,
      type: 'Experimental',
      tips() {
        return I18nT('meilisearch.experimental_max_number_of_batched_tasks')
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
          value = `${item.name} = "${item.value}"`
        } else {
          value = `${item.name} = ${item.value}`
        }
        config = config.replace(regex, `${value}\n`)
      } else {
        config = config.replace(regex, `\n\n`)
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
