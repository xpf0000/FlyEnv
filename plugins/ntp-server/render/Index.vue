<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <el-radio-button v-for="(label, index) in tabs" :key="index" :value="index" :label="label" />
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" :type-flag="typeFlag" :title="title">
        <template v-if="runningVersion" #tool-left>
          <el-tooltip :content="t('usageTitle')" :show-after="600">
            <el-button
              style="color: #01cc74"
              class="button"
              link
              :aria-label="t('usageTitle')"
              @click.stop="openUsage"
            >
              <yb-icon
                style="width: 20px; height: 20px; margin-left: 10px"
                :svg="import('@/svg/http.svg?raw')"
              />
            </el-button>
          </el-tooltip>
        </template>
      </Service>
      <Manager
        v-else-if="tab === 1"
        :type-flag="typeFlag"
        :title="title"
        :has-static="true"
        :show-brew-lib="false"
        :show-port-lib="false"
        url="https://github.com/xpf0000/ntp-server/releases"
      />
      <Config v-else-if="tab === 2" :running-version="runningVersion" />
      <Logs v-else-if="tab === 3" />
    </div>
    <el-dialog
      v-model="usageVisible"
      :title="t('usageTitle')"
      width="min(560px, 92vw)"
      append-to-body
    >
      <div class="space-y-3">
        <p>{{ t('usageClient') }}</p>
        <dl v-if="usageSettings" class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt>{{ t('usageAddress') }}</dt>
          <dd
            ><code class="select-text">{{ clientAddress }}</code></dd
          >
          <dt>{{ t('listenPort') }}</dt>
          <dd
            ><code class="select-text">{{ usageSettings.port }}</code></dd
          >
        </dl>
        <p v-else>{{ t('usageCheckConfig') }}</p>
        <p>{{ t('usageLan') }}</p>
        <p>{{ t('usageStandardPort') }}</p>
      </div>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import { I18nT } from '@lang/index'
  import { AppModuleSetup } from '@/core/Module'
  import { BrewStore } from '@/store/brew'
  import Service from '@/components/ServiceManager/index.vue'
  import Manager from '@/components/VersionManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import { title, typeFlag } from './Module'
  import type { NtpSettings } from '../config'
  import { settingsController } from './settings'
  import { t } from './lang'

  const { tab, checkVersion } = AppModuleSetup(typeFlag)
  const module = BrewStore().module(typeFlag)
  const runningVersion = computed(() => module.installed.find((item) => item.run && !item.running))
  const usageVisible = ref(false)
  const usageSettings = ref<NtpSettings>()
  const clientAddress = computed(() => {
    const host = usageSettings.value?.host
    if (host === '0.0.0.0') return '127.0.0.1'
    if (host === '::') return '::1'
    return host
  })

  async function openUsage() {
    const running = runningVersion.value
    if (!running) return
    usageSettings.value = undefined
    usageVisible.value = true
    const result = await settingsController.load()
    if (usageVisible.value && runningVersion.value === running)
      usageSettings.value = result?.settings
  }

  watch(runningVersion, () => {
    usageVisible.value = false
  })

  const tabs = computed(() => [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ])
  checkVersion()
</script>
