<template>
  <Conf
    ref="conf"
    :type-flag="'dns'"
    :default-file="defaultFile"
    :file="file"
    :file-ext="'json'"
    :show-commond="true"
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
  import { join } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'
  import type { CommonSetItem } from '@/components/Conf/setup'
  import { uuid } from '@/util/Index'
  import { debounce } from 'lodash-es'
  import { DnsStore } from '@/components/DNS/dns'
  import Common from '@/components/Conf/common.vue'

  const conf = ref()
  const commonSetting: Ref<CommonSetItem[]> = ref([])

  const file = computed(() => {
    return join(window.Server.BaseDir!, 'dns/dns.json')
  })
  const defaultFile = computed(() => {
    return join(window.Server.BaseDir!, 'dns/dns.default.json')
  })

  const dnsStore = DnsStore()

  const names: CommonSetItem[] = [
    {
      name: 'bind',
      value: '0.0.0.0',
      enable: true,
      options: [
        { value: '0.0.0.0', label: '0.0.0.0' },
        ...dnsStore.ipList.map((i) => ({ value: i.ip, label: i.ip }))
      ],
      tips() {
        return 'Bind IP Address'
      }
    }
  ]
  let editConfig = ''
  let watcher: any

  const onSettingUpdate = () => {
    try {
      const config = JSON.parse(editConfig)
      commonSetting.value.forEach((item) => {
        if (item.enable) {
          config[item.name] = item.value
        } else {
          delete config[item.name]
        }
      })
      const json = JSON.stringify(config, null, 2)
      conf.value.setEditValue(json)
      editConfig = json
    } catch {}
  }

  const getCommonSetting = () => {
    if (watcher) {
      watcher()
    }
    try {
      const config = JSON.parse(editConfig)
      const arr = [...names].map((item) => {
        const value = config?.[item.name]
        item.enable = Object.prototype.hasOwnProperty.call(config, item.name)
        item.value = value
        item.key = uuid()
        return item
      })
      commonSetting.value = reactive(arr) as any
    } catch {
      commonSetting.value = reactive(
        [...names].map((item) => {
          item.enable = false
          item.value = '0.0.0.0'
          item.key = uuid()
          return item
        })
      ) as any
    }

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
      IPC.send('app-fork:dns', 'initConfig').then((key: string) => {
        IPC.off(key)
        conf?.value?.update()
      })
    }
  })
</script>
