<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, index) in tabs" :key="index">
        <el-radio-button :label="item" :value="index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="temporal" title="Temporal">
        <template v-if="isRunning" #tool-left>
          <el-button
            class="button temporal-ui-button"
            link
            :disabled="uiState === 'loading'"
            :style="{ color: uiState === 'error' ? '#f56c6c' : '#01cc74' }"
            @click.stop="openTemporalUi"
          >
            <el-icon v-if="uiState === 'loading'" class="is-loading">
              <Loading />
            </el-icon>
            <yb-icon
              v-else
              style="width: 20px; height: 20px"
              :svg="import('@/svg/http.svg?raw')"
            ></yb-icon>
          </el-button>
        </template>
      </Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="temporal"
        :has-static="true"
        url="https://docs.temporal.io/self-hosted-guide"
        title="Temporal"
      ></Manager>
      <Config v-if="tab === 2"></Config>
      <Logs v-if="tab === 3"></Logs>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'
  import { fs, shell } from '@/util/NodeFn'
  import { computed, ref } from 'vue'
  import { Loading } from '@element-plus/icons-vue'
  import { join } from '@/util/path-browserify'
  import IPC from '@/util/IPC'
  import { MessageError } from '@/util/Element'
  import { BrewStore } from '@/store/brew'

  const { tab, checkVersion } = AppModuleSetup('temporal')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]
  checkVersion()

  const brewStore = BrewStore()
  const uiState = ref<'idle' | 'loading' | 'error'>('idle')
  const currentVersion = computed(() => brewStore.currentVersion('temporal'))
  const isRunning = computed(() => brewStore.module('temporal').installed.some((item) => item.run))

  const invokeTemporal = (...args: any[]) => {
    return new Promise<any>((resolve) => {
      IPC.send('app-fork:temporal', ...args).then((key: string, res: any) => {
        if (res?.code === 200) {
          return
        }
        IPC.off(key)
        resolve(res)
      })
    })
  }

  const forkErrorMessage = (value: unknown, fallback: string) => {
    if (typeof value === 'string' && value.trim()) {
      return value
    }
    if (value instanceof Error && value.message) {
      return value.message
    }
    if (value && typeof value === 'object') {
      const error = value as Record<string, unknown>
      const message = error.message ?? error.msg ?? error.error
      if (typeof message === 'string' && message.trim()) {
        return message
      }
    }
    return fallback
  }

  const ensureUiInstalled = async () => {
    const info = await invokeTemporal('uiServerInfo')
    if (info?.code !== 0) {
      throw new Error(forkErrorMessage(info?.msg, I18nT('fork.downloadFileFail')))
    }
    if (info?.data?.installed) {
      return
    }
    const latest = await invokeTemporal('fetchUiLatest')
    const row = latest?.code === 0 ? latest.data : null
    if (!row?.url) {
      throw new Error(forkErrorMessage(latest?.msg, I18nT('fork.downloadFileFail')))
    }
    const installed = await invokeTemporal('installUiLatest', JSON.parse(JSON.stringify(row)))
    if (installed?.code !== 0) {
      throw new Error(forkErrorMessage(installed?.msg, I18nT('fork.downloadFileFail')))
    }
  }

  const openURL = async () => {
    let port = '8233'
    const confFile = join(window.Server.BaseDir!, 'temporal/config/temporal-ui.yaml')
    if (await fs.existsSync(confFile)) {
      const content = await fs.readFile(confFile)
      const line = content.split('\n').find((item: string) => item.trim().startsWith('port:'))
      port = line?.split(':').pop()?.trim() || port
    }
    await shell.openExternal(`http://127.0.0.1:${port}/`)
  }

  const openTemporalUi = async () => {
    if (uiState.value === 'loading' || !currentVersion.value) {
      return
    }
    uiState.value = 'loading'
    try {
      await ensureUiInstalled()
      const started = await invokeTemporal(
        'startUiServer',
        JSON.parse(JSON.stringify(currentVersion.value))
      )
      if (started?.code !== 0) {
        throw new Error(forkErrorMessage(started?.msg, I18nT('fork.startFail')))
      }
      await openURL()
      uiState.value = 'idle'
    } catch (error) {
      uiState.value = 'error'
      MessageError(forkErrorMessage(error, I18nT('base.fail')))
    }
  }
</script>

<style lang="scss" scoped>
  .temporal-ui-button {
    width: 40px;
    height: 32px;
    margin-left: 10px;
    padding: 0;
    justify-content: center;
    align-items: center;
  }
</style>
