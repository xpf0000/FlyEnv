<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, index) in tabs" :key="index">
        <el-radio-button :label="item" :value="index"></el-radio-button>
      </template>
    </el-radio-group>
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
  import { I18nT } from '@lang/index'
  import { computed } from 'vue'
  import { BrewStore } from '@/store/brew'
  import { join } from 'path-browserify'
  import { shell, fs } from '@/util/NodeFn'

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
    const iniFile = join(window.Server.BaseDir!, 'mailpit/mailpit.conf')
    if (await fs.existsSync(iniFile)) {
      const content = await readFile(iniFile, 'utf-8')
      const logStr = content.split('\n').find((s: string) => s.includes('MP_UI_BIND_ADDR'))
      const port = logStr?.trim()?.split('=')?.pop()?.split(':')?.pop() ?? '8025'
      shell.openExternal(`http://127.0.0.1:${port}/`).then().catch()
    }
  }
</script>
