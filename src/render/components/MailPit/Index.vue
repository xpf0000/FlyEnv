<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <li
        v-for="(item, index) in tabs"
        :key="index"
        :class="tab === index ? 'active' : ''"
        @click="tab = index"
        >{{ item }}</li
      >
    </ul>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="mailpit" title="Mailpit">
        <template v-if="isRunning" #tool-left>
          <el-button style="color: #01cc74" class="button" link @click.stop="openURL">
            <yb-icon
              style="width: 20px; height: 20px; margin-left: 10px"
              :svg="import('@/svg/http.svg?raw')"
            ></yb-icon>
          </el-button>
        </template>
      </Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="mailpit"
        :has-static="true"
        :show-port-lib="false"
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
  import { I18nT } from '@shared/lang'
  import { computed } from 'vue'
  import { BrewStore } from '@/store/brew'

  const { shell } = require('@electron/remote')
  const { join } = require('path')
  const { existsSync, readFile } = require('fs-extra')

  const { tab, checkVersion } = AppModuleSetup('mailpit')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]
  checkVersion()
  const brewStore = BrewStore()
  const isRunning = computed(() => {
    return brewStore.module('mailpit').installed.some((m) => m.run)
  })
  const openURL = async () => {
    const iniFile = join(global.Server.BaseDir!, 'mailpit/mailpit.conf')
    if (existsSync(iniFile)) {
      const content = await readFile(iniFile, 'utf-8')
      const logStr = content.split('\n').find((s: string) => s.includes('MP_UI_BIND_ADDR'))
      const port = logStr?.trim()?.split('=')?.pop()?.split(':')?.pop() ?? '8025'
      shell.openExternal(`http://127.0.0.1:${port}/`).then().catch()
    }
  }
</script>
