<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="mongodb" title="MongoDB">
        <template v-if="isRunning" #tool-left>
          <el-button
            style="color: #01cc74"
            class="button"
            link
            :disabled="dbGateOpening || !nodeVersion"
            @click.stop="openDbGate"
          >
            <el-icon
              v-if="dbGateOpening"
              class="is-loading"
              style="width: 20px; height: 20px; margin-left: 10px"
            >
              <Loading />
            </el-icon>
            <yb-icon
              v-else
              style="width: 20px; height: 20px; margin-left: 10px"
              :svg="import('@/svg/http.svg?raw')"
            ></yb-icon>
          </el-button>
        </template>
      </Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="mongodb"
        url="https://www.mongodb.com/try/download/community"
        title="Mongodb"
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
  import { computed } from 'vue'
  import { Loading } from '@element-plus/icons-vue'
  import { BrewStore } from '@/store/brew'
  import { MessageError } from '@/util/Element'
  import { shell } from '@/util/NodeFn'
  import IPC from '@/util/IPC'
  import { ElMessage } from 'element-plus'
  import { isWebPanelInstallNotice } from '@shared/WebPanelInstallNotice'
  import { webPanelOpeningState } from '@/util/WebPanelOpening'

  const { tab, checkVersion } = AppModuleSetup('mongodb')
  const brewStore = BrewStore()
  const isRunning = computed(() => {
    return brewStore.module('mongodb').installed.some((item) => item.run)
  })
  const nodeVersion = computed(() => brewStore.currentVersion('node'))
  const dbGateOpeningState = webPanelOpeningState('dbgate')
  const dbGateOpening = dbGateOpeningState.opening
  let installNotice: { close: () => void } | undefined
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]

  const openDbGate = () => {
    if (dbGateOpening.value || !isRunning.value) return
    if (!nodeVersion.value?.bin) {
      MessageError(I18nT('base.needSelectVersion'))
      return
    }
    if (!dbGateOpeningState.start()) return
    const selectedNode = JSON.parse(JSON.stringify(nodeVersion.value))
    IPC.sendSensitive('app-fork:mongodb', 'openDbGate', selectedNode).then(
      (key: string, res: any) => {
        if (res?.code === 200) {
          if (isWebPanelInstallNotice(res.msg)) {
            installNotice?.close()
            installNotice = ElMessage({
              message: I18nT('base.webPanelFirstInstall', { service: res.msg.service }),
              type: 'info',
              duration: 0,
              showClose: true
            })
          }
          return
        }
        installNotice?.close()
        installNotice = undefined
        IPC.off(key)
        dbGateOpeningState.finish()
        if (res?.code === 0 && res.data?.url) {
          shell.openExternal(res.data.url).catch()
          return
        }
        MessageError(res?.msg ?? 'DbGate failed to start')
      }
    )
  }
  checkVersion()
</script>
