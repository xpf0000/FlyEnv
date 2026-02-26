<template>
  <Conf
    ref="conf"
    :type-flag="'redis'"
    :default-file="defaultFile"
    :file="file"
    :file-ext="'conf'"
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
  import { debounce } from 'lodash-es'
  import { AppStore } from '@/store/app'
  import IPC from '@/util/IPC'
  import { uuid } from '@/util/Index'
  import { join } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'

  const appStore = AppStore()
  const conf = ref()
  const commonSetting: Ref<CommonSetItem[]> = ref([])

  const currentVersion = computed(() => {
    return appStore.config?.server?.redis?.current?.version
  })

  const vm = computed(() => {
    return currentVersion?.value?.split('.')?.shift()
  })

  const file = computed(() => {
    if (!vm.value) {
      return ''
    }
    return join(window.Server.RedisDir!, `redis-${vm.value}.conf`)
  })

  const defaultFile = computed(() => {
    if (!vm.value) {
      return ''
    }
    return join(window.Server.RedisDir!, `redis-${vm.value}-default.conf`)
  })

  const names: CommonSetItem[] = [
    {
      name: 'port',
      value: '6379',
      enable: true,
      tips() {
        return I18nT('host.port')
      }
    },
    {
      name: 'timeout',
      value: '0',
      enable: true,
      tips() {
        return I18nT('redis.timeout')
      }
    },
    {
      name: 'maxclients',
      value: '10000',
      enable: true,
      tips() {
        return I18nT('mysql.max_connections')
      }
    },
    {
      name: 'databases',
      value: '16',
      enable: true,
      tips() {
        return I18nT('redis.databases')
      }
    },
    {
      name: 'requirepass',
      value: '',
      enable: true,
      tips() {
        return I18nT('redis.requirepass')
      }
    },
    {
      name: 'maxmemory',
      value: '0',
      enable: true,
      tips() {
        return I18nT('redis.maxmemory')
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
    const config = editConfig.replace(/\r\n/gm, '\n')
    const arr = [...names]
      .map((item) => {
        const regex = new RegExp(`^[\\s\\n]?((?!#)([\\s]*?))${item.name}(.*?)([^\\n])(\\n|$)`, 'gm')
        const matchs =
          config.match(regex)?.map((s) => {
            const sarr = s
              .trim()
              .split(' ')
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

  if (file.value) {
    fs.existsSync(file.value).then((e) => {
      if (!e) {
        IPC.send('app-fork:redis', 'initConf', {
          version: currentVersion.value
        }).then((key: string) => {
          IPC.off(key)
          conf?.value?.update()
        })
      }
    })
  }
</script>
