<template>
  <Conf
    v-if="configPath"
    ref="conf"
    :type-flag="typeFlag"
    :file="configPath"
    file-ext="json"
    config-language="json"
    :show-commond="true"
    :show-load-default="false"
    :version="runningVersion"
    @on-type-change="onTypeChange"
  >
    <template #common>
      <Common v-if="settings" :setting="commonSettings" />
      <div
        v-if="settings && settings.mode !== 'real'"
        class="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
      >
        <el-card
          class="col-span-2"
          :header="t(settings.mode === 'offset' ? 'offsetSeconds' : 'frozenTime')"
        >
          <div v-if="settings.mode === 'offset'" class="flex flex-wrap items-center gap-2">
            <el-input-number
              v-model="settings.offsetSeconds"
              :aria-label="t('offsetSeconds')"
              :min="-maxOffsetSeconds"
              :max="maxOffsetSeconds"
              :precision="0"
            />
            <el-button-group>
              <el-button
                v-for="preset in presets"
                :key="preset.label"
                @click="settings.offsetSeconds = preset.seconds"
              >
                {{ t(preset.label) }}
              </el-button>
            </el-button-group>
          </div>
          <div v-else class="flex flex-wrap items-center gap-2">
            <el-date-picker
              v-model="frozenDate"
              type="datetime"
              :clearable="false"
              :aria-label="t('frozenTime')"
              :placeholder="t('pickTime')"
            />
            <span class="text-sm">{{ t('localTimeZone') }}</span>
          </div>
          <template #footer>
            <el-button @click="settings.mode = 'real'">{{ t('resetRealTime') }}</el-button>
          </template>
        </el-card>
      </div>
      <el-alert v-if="draftError" :title="draftError" type="error" :closable="false" />
    </template>
  </Conf>
  <div v-else v-loading="controller.busy" class="module-config">
    <el-alert v-if="controller.error" :title="controller.error" type="error" :closable="false" />
    <el-button v-if="controller.error" class="mt-3" @click="prepareConfig">
      {{ t('reload') }}
    </el-button>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import Common from '@/components/Conf/common.vue'
  import type { CommonSetItem } from '@/components/Conf/setup'
  import {
    maxOffsetSeconds,
    parseConfig,
    parseFrozenTime,
    settingsFromConfig,
    updateConfig
  } from '../config'
  import type { NtpSettings } from '../config'
  import { settingsController as controller } from './settings'
  import { typeFlag } from './Module'
  import { t } from './lang'
  import type { SoftInstalled } from '@shared/app'

  defineProps<{ runningVersion?: SoftInstalled }>()

  const conf = ref<InstanceType<typeof Conf>>()
  const configPath = ref('')
  const settings = ref<NtpSettings>()
  const portInput = ref('')
  const upstreamInput = ref('')
  const draftError = ref('')
  const modes = ['real', 'offset', 'frozen'] as const
  const presets = [
    { label: 'aheadWeek', seconds: 604800 },
    { label: 'behindHours', seconds: -7200 },
    { label: 'aheadYear', seconds: 31536000 }
  ]

  const commonSettings = computed<CommonSetItem[]>(() => {
    const form = settings.value
    if (!form) return []
    const choices = [
      { label: t('enabled'), value: 'true' },
      { label: t('disabled'), value: 'false' }
    ]
    const field = (key: string, value: string, onChange: (value: string) => void) => ({
      key,
      name: t(key),
      value,
      onChange,
      enable: true,
      showEnable: false,
      tips: () => t(`${key}Help`)
    })
    return [
      {
        ...field('clockMode', form.mode, (value) => {
          if (value === 'frozen' && !frozenDate.value) {
            form.frozenTime = new Date().toISOString()
          }
          form.mode = value as NtpSettings['mode']
        }),
        options: modes.map((mode) => ({ value: mode, label: t(mode) }))
      },
      field('listenHost', form.host, (value) => {
        form.host = value
      }),
      field('listenPort', portInput.value, (value) => {
        portInput.value = value
        form.port = /^\d+$/.test(value) ? Number(value) : NaN
      }),
      {
        ...field('logRequests', String(form.logRequests), (value) => {
          form.logRequests = value === 'true'
        }),
        options: choices
      },
      {
        ...field('upstreamSync', String(form.upstreamEnabled), (value) => {
          form.upstreamEnabled = value === 'true'
        }),
        options: choices,
        show: form.mode === 'real'
      },
      {
        ...field('upstreamServers', upstreamInput.value, (value) => {
          upstreamInput.value = value
          form.upstreamServers = value.replace(/[,，]/g, '\n')
        }),
        show: form.mode === 'real' && form.upstreamEnabled
      }
    ]
  })

  const frozenDate = computed({
    get() {
      return parseFrozenTime(settings.value?.frozenTime) ?? null
    },
    set(value: Date | null) {
      if (settings.value && value && Number.isFinite(value.getTime())) {
        const time = value.toISOString()
        if (parseFrozenTime(time)) settings.value.frozenTime = time
      }
    }
  })

  function onTypeChange(_type: 'default' | 'common', content: string) {
    try {
      const form = settingsFromConfig(parseConfig(content))
      portInput.value = String(form.port)
      upstreamInput.value = form.upstreamServers.split('\n').join(', ')
      settings.value = form
      draftError.value = ''
      if (form.mode === 'frozen' && !frozenDate.value) {
        settings.value.frozenTime = new Date().toISOString()
      }
    } catch {
      settings.value = undefined
      draftError.value = t('invalidConfig')
    }
  }

  watch(
    settings,
    (form, previous) => {
      if (!form || form !== previous || !conf.value) return
      try {
        const content = conf.value.getEditValue()
        const next = updateConfig(parseConfig(content), form)
        conf.value.setEditValue(JSON.stringify(next, null, 2) + '\n')
        draftError.value = ''
      } catch (error) {
        const message = (error as Error).message
        draftError.value = message === 'invalidFrozenTime' ? '' : t(message)
      }
    },
    { deep: true, flush: 'sync' }
  )

  async function prepareConfig() {
    configPath.value = (await controller.prepareConfig()) ?? ''
  }

  void prepareConfig()
</script>
