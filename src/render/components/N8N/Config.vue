<template>
  <Conf
    ref="conf"
    :type-flag="'n8n'"
    :default-file="defaultFile"
    :file="file"
    :file-ext="'env'"
    :show-commond="true"
    @on-type-change="onTypeChange"
  >
    <template #common>
      <Common :setting="commonSetting" />
      <div class="mt-6 px-1">
        <el-divider content-position="left">
          <span class="text-sm font-medium">{{ I18nT('n8n.ownerResetTitle') }}</span>
        </el-divider>
        <div class="flex items-center gap-4 mt-2">
          <el-button type="danger" :loading="resetting" @click="resetOwner">
            {{ I18nT('n8n.ownerResetBtn') }}
          </el-button>
          <span class="text-sm text-gray-400">{{ I18nT('n8n.ownerResetTip') }}</span>
        </div>
      </div>
    </template>
  </Conf>
</template>

<script lang="ts" setup>
  import { computed, reactive, type Ref, ref, watch } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import IPC from '@/util/IPC'
  import type { CommonSetItem } from '@/components/Conf/setup'
  import { I18nT } from '@lang/index'
  import { debounce } from 'lodash-es'
  import Common from '@/components/Conf/common.vue'
  import { uuid } from '@/util/Index'
  import { join } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'
  import { ElMessageBox, ElMessage } from 'element-plus'

  const commonSetting: Ref<CommonSetItem[]> = ref([])
  const conf = ref()
  const resetting = ref(false)

  const resetOwner = async () => {
    try {
      await ElMessageBox.confirm(I18nT('n8n.ownerResetConfirm'), I18nT('n8n.ownerResetTitle'), {
        type: 'warning',
        confirmButtonText: I18nT('base.confirm'),
        cancelButtonText: I18nT('base.cancel')
      })
    } catch {
      return
    }
    resetting.value = true
    IPC.send('app-fork:n8n', 'resetOwnerDB').then((key: string, res: any) => {
      IPC.off(key)
      resetting.value = false
      if (res?.code === 0) {
        ElMessage.success(I18nT('n8n.ownerResetSuccess'))
      } else {
        ElMessage.error(res?.msg ?? I18nT('n8n.ownerResetFailed'))
      }
    })
  }

  const file = computed(() => {
    return join(window.Server.BaseDir!, 'n8n/n8n.env')
  })
  const defaultFile = computed(() => {
    return join(window.Server.BaseDir!, 'n8n/n8n.env.default')
  })

  const names: CommonSetItem[] = [
    {
      name: 'N8N_PORT',
      value: '5678',
      enable: false,
      tips() {
        return I18nT('n8n.N8N_PORT')
      }
    },
    {
      name: 'N8N_HOST',
      value: 'localhost',
      enable: false,
      tips() {
        return I18nT('n8n.N8N_HOST')
      }
    },
    {
      name: 'N8N_PROTOCOL',
      value: 'http',
      enable: false,
      tips() {
        return I18nT('n8n.N8N_PROTOCOL')
      }
    },
    {
      name: 'N8N_PATH',
      value: '/',
      enable: false,
      tips() {
        return I18nT('n8n.N8N_PATH')
      }
    },
    {
      name: 'DB_TYPE',
      value: 'sqlite',
      enable: false,
      tips() {
        return I18nT('n8n.DB_TYPE')
      }
    },
    {
      name: 'N8N_USER_FOLDER',
      value: '',
      enable: false,
      isString: true,
      tips() {
        return I18nT('n8n.N8N_USER_FOLDER')
      }
    },
    {
      name: 'N8N_ENCRYPTION_KEY',
      value: '',
      enable: false,
      isString: true,
      tips() {
        return I18nT('n8n.N8N_ENCRYPTION_KEY')
      }
    },
    {
      name: 'WEBHOOK_URL',
      value: '',
      enable: false,
      isString: true,
      tips() {
        return I18nT('n8n.WEBHOOK_URL')
      }
    },
    {
      name: 'N8N_LOG_LEVEL',
      value: 'info',
      enable: false,
      tips() {
        return I18nT('n8n.N8N_LOG_LEVEL')
      }
    },
    {
      name: 'N8N_LOG_OUTPUT',
      value: 'console',
      enable: false,
      tips() {
        return I18nT('n8n.N8N_LOG_OUTPUT')
      }
    },
    {
      name: 'EXECUTIONS_PROCESS',
      value: 'main',
      enable: false,
      tips() {
        return I18nT('n8n.EXECUTIONS_PROCESS')
      }
    },
    {
      name: 'EXECUTIONS_MODE',
      value: 'regular',
      enable: false,
      tips() {
        return I18nT('n8n.EXECUTIONS_MODE')
      }
    },
    {
      name: 'N8N_METRICS',
      value: 'false',
      enable: false,
      tips() {
        return I18nT('n8n.N8N_METRICS')
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
          const v = sarr.join('=')
          return { k, v }
        }) ?? []
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
    if (editConfig !== config) {
      editConfig = config
      getCommonSetting()
    } else if (commonSetting.value.length === 0) {
      getCommonSetting()
    }
  }

  fs.existsSync(file.value).then((e) => {
    if (!e) {
      IPC.send('app-fork:n8n', 'initConfig').then((key: string) => {
        IPC.off(key)
        conf?.value?.update()
      })
    }
  })
</script>
