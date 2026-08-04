<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="rnacos" title="R-Nacos">
        <template #tool-left>
          <template v-if="isRunning">
            <el-button
              style="color: #01cc74"
              class="button ml-[10px]"
              link
              @click.stop="openConsole"
            >
              <yb-icon class="w-[20px] h-[20px]" :svg="import('@/svg/http.svg?raw')"></yb-icon>
            </el-button>
          </template>
        </template>
      </Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="rnacos"
        :has-static="true"
        :show-port-lib="false"
        url="https://github.com/r-nacos/r-nacos/releases"
        title="R-Nacos"
      ></Manager>
      <Config v-else-if="tab === 2"></Config>
      <Logs v-else-if="tab === 3"></Logs>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '@/components/ServiceManager/index.vue'
  import Manager from '../VersionManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'
  import { fs, shell } from '@/util/NodeFn'
  import { BrewStore } from '@/store/brew'
  import { computed } from 'vue'
  import { join } from '@/util/path-browserify'
  import { parsePort, readConfigValue } from '@shared/ServiceWebAddress'

  const { tab, checkVersion } = AppModuleSetup('rnacos')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]
  checkVersion()

  const brewStore = BrewStore()

  const isRunning = computed(() => {
    return brewStore.module('rnacos').installed.some((m) => m.run)
  })

  const openConsole = async () => {
    let port = 10848
    const confFile = join(window.Server.BaseDir!, 'rnacos/rnacos.conf')
    if (await fs.existsSync(confFile)) {
      try {
        const content = await fs.readFile(confFile)
        port = parsePort(readConfigValue(content, 'RNACOS_HTTP_CONSOLE_PORT'), 10848)
      } catch {}
    }
    const url = `http://127.0.0.1:${port}/rnacos/`
    shell.openExternal(url).then().catch()
  }
</script>
