<template>
  <Conf
    ref="conf"
    :type-flag="'minio'"
    :show-load-default="false"
    :file="file"
    :file-ext="'conf'"
    :show-commond="true"
    url="https://github.com/minio/minio/blob/master/docs/config/README.md"
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
    return join(global.Server.BaseDir, 'minio/minio.conf')
  })

  const names: CommonSetItem[] = [
    {
      name: 'MINIO_ADDRESS',
      value: ':9000',
      enable: false,
      type: 'Network',
      isString: true,
      tips() {
        return I18nT('minio.MINIO_ADDRESS')
      }
    },
    {
      name: 'MINIO_CONSOLE_ADDRESS',
      value: '',
      enable: false,
      type: 'Network',
      isString: true,
      tips() {
        return I18nT('minio.MINIO_CONSOLE_ADDRESS')
      }
    },
    {
      name: 'MINIO_CERTS_DIR',
      value: '${HOME}/.minio/certs',
      enable: false,
      type: 'Security',
      isString: true,
      isDir: true,
      tips() {
        return I18nT('minio.MINIO_CERTS_DIR')
      }
    },
    {
      name: 'MINIO_ROOT_USER',
      value: 'minioadmin',
      enable: true,
      type: 'Security',
      isString: true,
      tips() {
        return I18nT('minio.MINIO_ROOT_USER')
      }
    },
    {
      name: 'MINIO_ROOT_PASSWORD',
      value: 'minioadmin',
      enable: true,
      type: 'Security',
      isString: true,
      tips() {
        return I18nT('minio.MINIO_ROOT_PASSWORD')
      }
    },
    {
      name: 'MINIO_SITE_NAME',
      value: 'cal-rack0',
      enable: false,
      type: 'General',
      isString: true,
      tips() {
        return I18nT('minio.MINIO_SITE_NAME')
      }
    },
    {
      name: 'MINIO_SITE_REGION',
      value: 'us-west-1',
      enable: false,
      type: 'General',
      isString: true,
      tips() {
        return I18nT('minio.MINIO_SITE_REGION')
      }
    },
    {
      name: 'MINIO_SITE_COMMENT',
      value: '',
      enable: false,
      type: 'General',
      isString: true,
      tips() {
        return I18nT('minio.MINIO_SITE_COMMENT')
      }
    },
    {
      name: 'MINIO_STORAGE_CLASS_STANDARD',
      value: 'EC:4',
      enable: false,
      type: 'Storage',
      isString: true,
      tips() {
        return I18nT('minio.MINIO_STORAGE_CLASS_STANDARD')
      }
    },
    {
      name: 'MINIO_STORAGE_CLASS_RRS',
      value: 'EC:2',
      enable: false,
      type: 'Storage',
      isString: true,
      tips() {
        return I18nT('minio.MINIO_STORAGE_CLASS_RRS')
      }
    },
    {
      name: 'MINIO_BROWSER',
      value: 'on',
      enable: false,
      type: 'General',
      options: [
        { label: 'on', value: 'on' },
        { label: 'off', value: 'off' }
      ],
      tips() {
        return I18nT('minio.MINIO_BROWSER')
      }
    },
    {
      name: 'MINIO_DOMAIN',
      value: '',
      enable: false,
      type: 'Network',
      isString: true,
      tips() {
        return I18nT('minio.MINIO_DOMAIN')
      }
    },
    {
      name: 'MINIO_ETCD_ENDPOINTS',
      value: 'http://localhost:2379',
      enable: false,
      type: 'Cluster',
      isString: true,
      tips() {
        return I18nT('minio.MINIO_ETCD_ENDPOINTS')
      }
    },
    {
      name: 'MINIO_ETCD_PATH_PREFIX',
      value: '',
      enable: false,
      type: 'Cluster',
      isString: true,
      tips() {
        return I18nT('minio.MINIO_ETCD_PATH_PREFIX')
      }
    },
    {
      name: 'MINIO_API_REQUESTS_MAX',
      value: 'auto',
      enable: false,
      type: 'Performance',
      isString: true,
      tips() {
        return I18nT('minio.MINIO_API_REQUESTS_MAX')
      }
    },
    {
      name: 'MINIO_API_CLUSTER_DEADLINE',
      value: '10s',
      enable: false,
      type: 'Performance',
      isString: true,
      tips() {
        return I18nT('minio.MINIO_API_CLUSTER_DEADLINE')
      }
    },
    {
      name: 'MINIO_API_CORS_ALLOW_ORIGIN',
      value: '*',
      enable: false,
      type: 'Network',
      isString: true,
      tips() {
        return I18nT('minio.MINIO_API_CORS_ALLOW_ORIGIN')
      }
    },
    {
      name: 'MINIO_API_REMOTE_TRANSPORT_DEADLINE',
      value: '2h',
      enable: false,
      type: 'Network',
      isString: true,
      tips() {
        return I18nT('minio.MINIO_API_REMOTE_TRANSPORT_DEADLINE')
      }
    },
    {
      name: 'MINIO_API_LIST_QUORUM',
      value: 'strict',
      enable: false,
      type: 'Performance',
      options: [
        { label: 'optimal', value: 'optimal' },
        { label: 'reduced', value: 'reduced' },
        { label: 'disk', value: 'disk' },
        { label: 'strict', value: 'strict' },
        { label: 'auto', value: 'auto' }
      ],
      tips() {
        return I18nT('minio.MINIO_API_LIST_QUORUM')
      }
    },
    {
      name: 'MINIO_API_REPLICATION_PRIORITY',
      value: 'auto',
      enable: false,
      type: 'Performance',
      isString: true,
      tips() {
        return I18nT('minio.MINIO_API_REPLICATION_PRIORITY')
      }
    },
    {
      name: 'MINIO_API_REPLICATION_MAX_WORKERS',
      value: '500',
      enable: false,
      type: 'Performance',
      tips() {
        return I18nT('minio.MINIO_API_REPLICATION_MAX_WORKERS')
      }
    },
    {
      name: 'MINIO_API_TRANSITION_WORKERS',
      value: '100',
      enable: false,
      type: 'Performance',
      tips() {
        return I18nT('minio.MINIO_API_TRANSITION_WORKERS')
      }
    },
    {
      name: 'MINIO_API_STALE_UPLOADS_EXPIRY',
      value: '24h',
      enable: false,
      type: 'Storage',
      isString: true,
      tips() {
        return I18nT('minio.MINIO_API_STALE_UPLOADS_EXPIRY')
      }
    },
    {
      name: 'MINIO_API_STALE_UPLOADS_CLEANUP_INTERVAL',
      value: '6h',
      enable: false,
      type: 'Storage',
      isString: true,
      tips() {
        return I18nT('minio.MINIO_API_STALE_UPLOADS_CLEANUP_INTERVAL')
      }
    },
    {
      name: 'MINIO_API_DELETE_CLEANUP_INTERVAL',
      value: '5m',
      enable: false,
      type: 'Storage',
      isString: true,
      tips() {
        return I18nT('minio.MINIO_API_DELETE_CLEANUP_INTERVAL')
      }
    },
    {
      name: 'MINIO_API_ODIRECT',
      value: 'on',
      enable: false,
      type: 'Performance',
      options: [
        { label: 'on', value: 'on' },
        { label: 'off', value: 'off' }
      ],
      tips() {
        return I18nT('minio.MINIO_API_ODIRECT')
      }
    },
    {
      name: 'MINIO_API_ROOT_ACCESS',
      value: 'on',
      enable: false,
      type: 'Security',
      options: [
        { label: 'on', value: 'on' },
        { label: 'off', value: 'off' }
      ],
      tips() {
        return I18nT('minio.MINIO_API_ROOT_ACCESS')
      }
    },
    {
      name: 'MINIO_API_SYNC_EVENTS',
      value: 'off',
      enable: false,
      type: 'Performance',
      options: [
        { label: 'on', value: 'on' },
        { label: 'off', value: 'off' }
      ],
      tips() {
        return I18nT('minio.MINIO_API_SYNC_EVENTS')
      }
    },
    {
      name: 'MINIO_API_OBJECT_MAX_VERSIONS',
      value: '9223372036854775807',
      enable: false,
      type: 'Storage',
      tips() {
        return I18nT('minio.MINIO_API_OBJECT_MAX_VERSIONS')
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
    if (editConfig !== config || commonSetting.value.length === 0) {
      editConfig = config
      getCommonSetting()
    }
  }

  if (!existsSync(file.value)) {
    IPC.send('app-fork:minio', 'initConfig').then((key: string) => {
      IPC.off(key)
      index.value += 1
      conf?.value?.update()
    })
  }
</script>
