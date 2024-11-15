<template>
  <Conf
    ref="conf"
    :type-flag="'mailpit'"
    :default-file="defaultFile"
    :file="file"
    :file-ext="'conf'"
    :show-commond="true"
    url="https://mailpit.axllent.org/docs/configuration/runtime-options/"
    @on-type-change="onTypeChange"
  >
    <template #common>
      <Common :setting="commonSetting" />
    </template>
  </Conf>
</template>

<script lang="ts" setup>
  import { computed, Ref, ref, watch } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import IPC from '@/util/IPC'
  import type { CommonSetItem } from '@/components/Conf/setup'
  import { I18nT } from '@shared/lang'
  import { debounce } from 'lodash'
  import Common from '@/components/Conf/common.vue'

  const { join } = require('path')
  const { existsSync } = require('fs-extra')

  const commonSetting: Ref<CommonSetItem[]> = ref([])
  const conf = ref()
  const file = computed(() => {
    return join(global.Server.BaseDir, 'mailpit/mailpit.conf')
  })
  const defaultFile = computed(() => {
    return join(global.Server.BaseDir, 'mailpit/mailpit.conf.default')
  })

  const names: CommonSetItem[] = [
    {
      name: 'MP_DATABASE',
      value: '',
      enable: false,
      type: 'General',
      tips() {
        return I18nT('mailpit.MP_DATABASE')
      }
    },
    {
      name: 'MP_LABEL',
      value: '',
      enable: false,
      type: 'General',
      tips() {
        return I18nT('mailpit.MP_LABEL')
      }
    },
    {
      name: 'MP_TENANT_ID',
      value: '',
      enable: false,
      type: 'General',
      tips() {
        return I18nT('mailpit.MP_TENANT_ID')
      }
    },
    {
      name: 'MP_MAX_MESSAGES',
      value: '500',
      enable: true,
      type: 'General',
      tips() {
        return I18nT('mailpit.MP_MAX_MESSAGES')
      }
    },
    {
      name: 'MP_MAX_AGE',
      value: '',
      enable: false,
      type: 'General',
      tips() {
        return I18nT('mailpit.MP_MAX_AGE')
      }
    },
    {
      name: 'MP_USE_MESSAGE_DATES',
      value: 'false',
      enable: true,
      options: [
        { value: 'false', label: 'false' },
        { value: 'true', label: 'true' }
      ],
      type: 'General',
      tips() {
        return I18nT('mailpit.MP_USE_MESSAGE_DATES')
      }
    },
    {
      name: 'MP_IGNORE_DUPLICATE_IDS',
      value: 'false',
      enable: true,
      options: [
        { value: 'false', label: 'false' },
        { value: 'true', label: 'true' }
      ],
      type: 'General',
      tips() {
        return I18nT('mailpit.MP_IGNORE_DUPLICATE_IDS')
      }
    },
    {
      name: 'MP_LOG_FILE',
      value: '',
      enable: false,
      isFile: true,
      type: 'General',
      tips() {
        return I18nT('mailpit.MP_LOG_FILE')
      }
    },
    {
      name: 'MP_QUIET',
      value: 'false',
      enable: true,
      options: [
        { value: 'false', label: 'false' },
        { value: 'true', label: 'true' }
      ],
      type: 'General',
      tips() {
        return I18nT('mailpit.MP_QUIET')
      }
    },
    {
      name: 'MP_VERBOSE',
      value: 'false',
      enable: true,
      options: [
        { value: 'false', label: 'false' },
        { value: 'true', label: 'true' }
      ],
      type: 'General',
      tips() {
        return I18nT('mailpit.MP_VERBOSE')
      }
    },
    {
      name: 'MP_UI_BIND_ADDR',
      value: '0.0.0.0:8025',
      enable: true,
      type: 'Web UI & API',
      tips() {
        return I18nT('mailpit.MP_UI_BIND_ADDR')
      }
    },
    {
      name: 'MP_WEBROOT',
      value: '/',
      enable: true,
      type: 'Web UI & API',
      tips() {
        return I18nT('mailpit.MP_WEBROOT')
      }
    },
    {
      name: 'MP_UI_AUTH_FILE',
      value: '',
      enable: false,
      isFile: true,
      type: 'Web UI & API',
      tips() {
        return I18nT('mailpit.MP_UI_AUTH_FILE')
      }
    },
    {
      name: 'MP_UI_TLS_CERT',
      value: '',
      enable: false,
      isFile: true,
      type: 'Web UI & API',
      tips() {
        return I18nT('mailpit.MP_UI_TLS_CERT')
      }
    },
    {
      name: 'MP_UI_TLS_KEY',
      value: '',
      enable: false,
      isFile: true,
      type: 'Web UI & API',
      tips() {
        return I18nT('mailpit.MP_UI_TLS_KEY')
      }
    },
    {
      name: 'MP_API_CORS',
      value: '',
      enable: false,
      type: 'Web UI & API',
      tips() {
        return I18nT('mailpit.MP_API_CORS')
      }
    },
    {
      name: 'MP_BLOCK_REMOTE_CSS_AND_FONTS',
      value: 'false',
      enable: true,
      options: [
        { value: 'false', label: 'false' },
        { value: 'true', label: 'true' }
      ],
      type: 'Web UI & API',
      tips() {
        return I18nT('mailpit.MP_BLOCK_REMOTE_CSS_AND_FONTS')
      }
    },
    {
      name: 'MP_ENABLE_SPAMASSASSIN',
      value: '',
      enable: false,
      type: 'Web UI & API',
      tips() {
        return I18nT('mailpit.MP_ENABLE_SPAMASSASSIN')
      }
    },
    {
      name: 'MP_ALLOW_UNTRUSTED_TLS',
      value: 'false',
      enable: true,
      options: [
        { value: 'false', label: 'false' },
        { value: 'true', label: 'true' }
      ],
      type: 'Web UI & API',
      tips() {
        return I18nT('mailpit.MP_ALLOW_UNTRUSTED_TLS')
      }
    },
    {
      name: 'MP_SMTP_BIND_ADDR',
      value: '0.0.0.0:1025',
      enable: true,
      type: 'SMTP server',
      tips() {
        return I18nT('mailpit.MP_SMTP_BIND_ADDR')
      }
    },
    {
      name: 'MP_SMTP_AUTH_FILE',
      value: '',
      enable: false,
      isFile: true,
      type: 'SMTP server',
      tips() {
        return I18nT('mailpit.MP_SMTP_AUTH_FILE')
      }
    },
    {
      name: 'MP_SMTP_AUTH_ACCEPT_ANY',
      value: 'false',
      enable: true,
      options: [
        { value: 'false', label: 'false' },
        { value: 'true', label: 'true' }
      ],
      type: 'SMTP server',
      tips() {
        return I18nT('mailpit.MP_SMTP_AUTH_ACCEPT_ANY')
      }
    },
    {
      name: 'MP_SMTP_TLS_CERT',
      value: '',
      enable: false,
      isFile: true,
      type: 'SMTP server',
      tips() {
        return I18nT('mailpit.MP_SMTP_TLS_CERT')
      }
    },
    {
      name: 'MP_SMTP_TLS_KEY',
      value: '',
      enable: false,
      isFile: true,
      type: 'SMTP server',
      tips() {
        return I18nT('mailpit.MP_SMTP_TLS_KEY')
      }
    },
    {
      name: 'MP_SMTP_REQUIRE_STARTTLS',
      value: 'false',
      enable: true,
      options: [
        { value: 'false', label: 'false' },
        { value: 'true', label: 'true' }
      ],
      type: 'SMTP server',
      tips() {
        return I18nT('mailpit.MP_SMTP_REQUIRE_STARTTLS')
      }
    },
    {
      name: 'MP_SMTP_REQUIRE_TLS',
      value: 'false',
      enable: true,
      options: [
        { value: 'false', label: 'false' },
        { value: 'true', label: 'true' }
      ],
      type: 'SMTP server',
      tips() {
        return I18nT('mailpit.MP_SMTP_REQUIRE_TLS')
      }
    },
    {
      name: 'MP_SMTP_AUTH_ALLOW_INSECURE',
      value: 'false',
      enable: true,
      options: [
        { value: 'false', label: 'false' },
        { value: 'true', label: 'true' }
      ],
      type: 'SMTP server',
      tips() {
        return I18nT('mailpit.MP_SMTP_AUTH_ALLOW_INSECURE')
      }
    },
    {
      name: 'MP_SMTP_STRICT_RFC_HEADERS',
      value: 'false',
      enable: true,
      options: [
        { value: 'false', label: 'false' },
        { value: 'true', label: 'true' }
      ],
      type: 'SMTP server',
      tips() {
        return I18nT('mailpit.MP_SMTP_STRICT_RFC_HEADERS')
      }
    },
    {
      name: 'MP_SMTP_MAX_RECIPIENTS',
      value: '100',
      enable: true,
      type: 'SMTP server',
      tips() {
        return I18nT('mailpit.MP_SMTP_MAX_RECIPIENTS')
      }
    },
    {
      name: 'MP_SMTP_ALLOWED_RECIPIENTS',
      value: '',
      enable: false,
      type: 'SMTP server',
      tips() {
        return I18nT('mailpit.MP_SMTP_ALLOWED_RECIPIENTS')
      }
    },
    {
      name: 'MP_SMTP_DISABLE_RDNS',
      value: 'false',
      enable: true,
      options: [
        { value: 'false', label: 'false' },
        { value: 'true', label: 'true' }
      ],
      type: 'SMTP server',
      tips() {
        return I18nT('mailpit.MP_SMTP_DISABLE_RDNS')
      }
    },
    {
      name: 'MP_SMTP_RELAY_CONFIG',
      value: '',
      enable: false,
      isFile: true,
      type: 'SMTP relay',
      tips() {
        return I18nT('mailpit.MP_SMTP_RELAY_CONFIG')
      }
    },
    {
      name: 'MP_SMTP_RELAY_ALL',
      value: 'false',
      enable: true,
      options: [
        { value: 'false', label: 'false' },
        { value: 'true', label: 'true' }
      ],
      type: 'SMTP relay',
      tips() {
        return I18nT('mailpit.MP_SMTP_RELAY_ALL')
      }
    },
    {
      name: 'MP_SMTP_RELAY_MATCHING',
      value: '',
      enable: false,
      type: 'SMTP relay',
      tips() {
        return I18nT('mailpit.MP_SMTP_RELAY_MATCHING')
      }
    },
    {
      name: 'MP_POP3_BIND_ADDR',
      value: '0.0.0.0:1110',
      enable: true,
      type: 'POP3 server',
      tips() {
        return I18nT('mailpit.MP_POP3_BIND_ADDR')
      }
    },
    {
      name: 'MP_POP3_AUTH_FILE',
      value: '',
      enable: false,
      isFile: true,
      type: 'POP3 server',
      tips() {
        return I18nT('mailpit.MP_POP3_AUTH_FILE')
      }
    },
    {
      name: 'MP_POP3_TLS_CERT',
      value: '',
      enable: false,
      isFile: true,
      type: 'POP3 server',
      tips() {
        return I18nT('mailpit.MP_POP3_TLS_CERT')
      }
    },
    {
      name: 'MP_POP3_TLS_KEY',
      value: '',
      enable: false,
      isFile: true,
      type: 'POP3 server',
      tips() {
        return I18nT('mailpit.MP_POP3_TLS_KEY')
      }
    },
    {
      name: 'MP_TAG',
      value: '',
      enable: false,
      type: 'Tagging',
      tips() {
        return I18nT('mailpit.MP_TAG')
      }
    },
    {
      name: 'MP_TAGS_CONFIG',
      value: '',
      enable: false,
      isFile: true,
      type: 'Tagging',
      tips() {
        return I18nT('mailpit.MP_TAGS_CONFIG')
      }
    },
    {
      name: 'MP_TAGS_TITLE_CASE',
      value: 'false',
      enable: true,
      options: [
        { value: 'false', label: 'false' },
        { value: 'true', label: 'true' }
      ],
      type: 'Tagging',
      tips() {
        return I18nT('mailpit.MP_TAGS_TITLE_CASE')
      }
    },
    {
      name: 'MP_TAGS_DISABLE',
      value: '',
      enable: false,
      type: 'Tagging',
      tips() {
        return I18nT('mailpit.MP_TAGS_DISABLE')
      }
    },
    {
      name: 'MP_WEBHOOK_URL',
      value: '',
      enable: false,
      type: 'Webhook',
      tips() {
        return I18nT('mailpit.MP_WEBHOOK_URL')
      }
    },
    {
      name: 'MP_WEBHOOK_LIMIT',
      value: '1',
      enable: true,
      type: 'Webhook',
      tips() {
        return I18nT('mailpit.MP_WEBHOOK_LIMIT')
      }
    }
  ]
  let editConfig = ''
  let watcher: any

  const onSettingUpdate = () => {
    let config = editConfig
    const list = ['#PhpWebStudy-Conf-Common-Begin#']
    commonSetting.value.forEach((item) => {
      const regex = new RegExp(`([\\s\\n#]?[^\\n]*)${item.name}(.*?)([^\\n])(\\n|$)`, 'g')
      config = config.replace(regex, `\n\n`)
      if (item.enable) {
        list.push(`${item.name}=${item.value}`)
      }
    })
    list.push('#PhpWebStudy-Conf-Common-END#')
    config = config
      .replace(/#PhpWebStudy-Conf-Common-Begin#([\s\S]*?)#PhpWebStudy-Conf-Common-END#/g, '')
      .replace(/\n+/g, '\n')
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
          const v = sarr.join(' ')
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

  if (!existsSync(file.value)) {
    IPC.send('app-fork:mailpit', 'initConfig').then((key: string) => {
      IPC.off(key)
      conf?.value?.update()
    })
  }
</script>
