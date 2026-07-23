<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="temporal" title="Temporal">
        <template #tool-left>
          <div class="flex items-center gap-2 pl-4 pr-2">
            <span class="flex-shrink-0">Web UI</span>
            <el-switch v-model="uiEnabled" />
            <template v-if="uiEnabled">
              <span v-if="uiInfo.installed && uiInfo.version" class="text-xs opacity-70"
                >v{{ uiInfo.version }}</span
              >
              <el-button link type="primary" :loading="uiInstalling" @click.stop="installUi">
                {{ I18nT('base.install') }}
              </el-button>
              <el-button
                v-if="uiInfo.installed"
                link
                :icon="Link"
                @click.stop="openURL"
              ></el-button>
            </template>
          </div>
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
  import { Link } from '@element-plus/icons-vue'
  import { computed, ref } from 'vue'
  import { join } from '@/util/path-browserify'
  import IPC from '@/util/IPC'
  import { MessageError } from '@/util/Element'
  import { TemporalSetup } from '@/components/Temporal/setup'

  const { tab, checkVersion } = AppModuleSetup('temporal')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]
  checkVersion()

  TemporalSetup.init()

  const uiEnabled = computed({
    get: () => TemporalSetup.uiEnabled,
    set: (v: boolean) => {
      TemporalSetup.uiEnabled = v
      TemporalSetup.save()
    }
  })

  const uiInfo = ref<{ installed: boolean; version: string | null }>({
    installed: false,
    version: null
  })
  const uiInstalling = ref(false)

  const refreshUiInfo = () => {
    IPC.send('app-fork:temporal', 'uiServerInfo').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0 && res?.data) {
        uiInfo.value = res.data
      }
    })
  }

  const installUi = () => {
    if (uiInstalling.value) {
      return
    }
    uiInstalling.value = true
    IPC.send('app-fork:temporal', 'fetchUiLatest').then((key: string, res: any) => {
      IPC.off(key)
      const row = res?.code === 0 ? res?.data : null
      if (!row?.url) {
        uiInstalling.value = false
        MessageError(I18nT('fork.downloadFileFail'))
        return
      }
      IPC.send('app-fork:temporal', 'installUiLatest', JSON.parse(JSON.stringify(row))).then(
        (k2: string, res2: any) => {
          IPC.off(k2)
          uiInstalling.value = false
          if (res2?.code === 0) {
            refreshUiInfo()
          } else {
            MessageError(res2?.msg ?? I18nT('fork.downloadFileFail'))
          }
        }
      )
    })
  }

  const openURL = async () => {
    let port = '8233'
    const confFile = join(window.Server.BaseDir!, 'temporal/config/temporal-ui.yaml')
    const exists = await fs.existsSync(confFile)
    if (exists) {
      const content = await fs.readFile(confFile)
      const line = content.split('\n').find((s: string) => s.trim().startsWith('port:'))
      port = line?.split(':')?.pop()?.trim() || '8233'
    }
    shell.openExternal(`http://127.0.0.1:${port}/`).then().catch()
  }

  refreshUiInfo()
</script>
