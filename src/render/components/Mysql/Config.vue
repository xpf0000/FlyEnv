<template>
  <Conf
    ref="conf"
    :type-flag="'mysql'"
    :default-conf="defaultConf"
    :file="file"
    :file-ext="'cnf'"
    :show-commond="true"
    @on-type-change="onTypeChange"
  >
    <template #common>
      <Common :setting="commonSetting" />
    </template>
  </Conf>
</template>

<script lang="ts" setup>
  import { computed, ref, watch, Ref, reactive } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import Common from '@/components/Conf/common.vue'
  import type { CommonSetItem } from '@/components/Conf/setup'
  import { I18nT } from '@lang/index'
  import { debounce } from 'lodash'
  import { AppStore } from '@/store/app'
  import { uuid } from '@shared/utils'

  const { join } = require('path')

  const appStore = AppStore()
  const conf = ref()
  const commonSetting: Ref<CommonSetItem[]> = ref([])

  const currentVersion = computed(() => {
    return appStore.config?.server?.mysql?.current?.version
  })

  const vm = computed(() => {
    return currentVersion?.value?.split('.')?.slice(0, 2)?.join('.')
  })

  const file = computed(() => {
    if (!vm.value) {
      return ''
    }
    return join(global.Server.MysqlDir, `my-${vm.value}.cnf`)
  })

  const defaultConf = computed(() => {
    if (!vm.value) {
      return ''
    }
    const dataDir = join(global.Server.MysqlDir, `data-${vm.value}`)
    return `[mysqld]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION
datadir=${dataDir}`
  })

  const names: CommonSetItem[] = [
    {
      name: 'port',
      value: '3306',
      enable: true,
      tips() {
        return I18nT('mysql.port')
      }
    },
    {
      name: 'key_buffer_size',
      value: '64M',
      enable: true,
      tips() {
        return I18nT('mysql.key_buffer_size')
      }
    },
    {
      name: 'query_cache_size',
      value: '32M',
      enable: true,
      show: vm?.value?.startsWith('5.'),
      tips() {
        return I18nT('mysql.query_cache_size')
      }
    },
    {
      name: 'tmp_table_size',
      value: '64M',
      enable: true,
      tips() {
        return I18nT('mysql.tmp_table_size')
      }
    },
    {
      name: 'innodb_buffer_pool_size',
      value: '256M',
      enable: true,
      tips() {
        return I18nT('mysql.innodb_buffer_pool_size')
      }
    },
    {
      name: 'innodb_log_buffer_size',
      value: '32M',
      enable: true,
      tips() {
        return I18nT('mysql.innodb_log_buffer_size')
      }
    },
    {
      name: 'sort_buffer_size',
      value: '1M',
      enable: true,
      tips() {
        return I18nT('mysql.sort_buffer_size')
      }
    },
    {
      name: 'read_buffer_size',
      value: '1M',
      enable: true,
      tips() {
        return I18nT('mysql.read_buffer_size')
      }
    },
    {
      name: 'read_rnd_buffer_size',
      value: '256K',
      enable: true,
      tips() {
        return I18nT('mysql.read_rnd_buffer_size')
      }
    },
    {
      name: 'thread_cache_size',
      value: '32',
      enable: true,
      tips() {
        return I18nT('mysql.thread_cache_size')
      }
    },
    {
      name: 'table_open_cache',
      value: '256',
      enable: true,
      tips() {
        return I18nT('mysql.table_open_cache')
      }
    },
    {
      name: 'max_connections',
      value: '500',
      enable: true,
      tips() {
        return I18nT('mysql.max_connections')
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
    const arr = [...names]
      .map((item) => {
        const regex = new RegExp(`^[\\s\\n]?((?!#)([\\s]*?))${item.name}(.*?)([^\\n])(\\n|$)`, 'gm')
        const matchs =
          config.match(regex)?.map((s) => {
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
        let value = find?.v ?? item.value
        if (item.isString) {
          value = value.replace(new RegExp(`"`, 'g'), '').replace(new RegExp(`'`, 'g'), '')
        }
        item.enable = !!find
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
</script>
