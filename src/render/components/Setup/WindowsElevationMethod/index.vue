<template>
  <div class="plant-title flex items-center gap-1">
    <span>{{ I18nT('setup.windowsElevationMethod') }}</span>
    <el-popover placement="top" width="auto">
      <template #reference>
        <yb-icon :svg="import('@/svg/question.svg?raw')" width="12" height="12"></yb-icon>
      </template>
      <template #default>
        <span>{{ I18nT('setup.windowsElevationMethodTips') }}</span>
      </template>
    </el-popover>
  </div>
  <div class="main reset-pass">
    <el-radio-group :model-value="method" :disabled="changing" @change="changeMethod">
      <el-radio-button :label="I18nT('setup.windowsElevationUac')" value="uac"></el-radio-button>
      <el-radio-button
        :label="I18nT('setup.windowsElevationHelper')"
        value="helper"
      ></el-radio-button>
    </el-radio-group>
    <el-button
      v-if="method === 'helper'"
      class="ml-2"
      :loading="HelperStore.isInstallResultPending()"
      :disabled="changing"
      @click="HelperStore.repair()"
    >
      {{ I18nT('setup.flyenvHelperBtn') }}
    </el-button>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { AppStore } from '@/store/app'
  import HelperStore from '@/store/helper'
  import { I18nT } from '@lang/index'
  import {
    resolveWindowsElevationMethod,
    type WindowsElevationMethod
  } from '@shared/WindowsHelperState'

  const store = AppStore()
  const savingPreference = ref(false)
  const changing = computed(() => savingPreference.value || HelperStore.isInstallResultPending())
  const method = computed(() =>
    resolveWindowsElevationMethod(store.config.setup.windowsElevationMethod)
  )

  const persist = async (value: WindowsElevationMethod) => {
    savingPreference.value = true
    try {
      store.config.setup.windowsElevationMethod = value
      await store.saveConfig()
    } finally {
      savingPreference.value = false
    }
  }

  const changeMethod = async (value: string | number | boolean) => {
    if ((value !== 'uac' && value !== 'helper') || changing.value || value === method.value) {
      return
    }
    if (value === 'uac') {
      await persist('uac')
      return
    }
    try {
      await persist((await HelperStore.repair()) ? 'helper' : 'uac')
    } catch {
      await persist('uac')
    }
  }
</script>
