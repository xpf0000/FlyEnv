<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="zincsearch" title="ZincSearch">
        <template #tool-left>
          <template v-if="isRunning">
            <el-tooltip content="ZincSearch UI" :show-after="600">
              <el-button style="color: #01cc74" class="button" link @click.stop="openURL">
                <yb-icon
                  style="width: 20px; height: 20px; margin-left: 10px"
                  :svg="import('@/svg/http.svg?raw')"
                ></yb-icon>
              </el-button>
            </el-tooltip>
          </template>
        </template>
      </Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="zincsearch"
        :has-static="true"
        :show-port-lib="false"
        :show-brew-lib="false"
        title="ZincSearch"
        url="https://github.com/zincsearch/zincsearch/releases"
      ></Manager>
      <Config v-else-if="tab === 2"></Config>
      <Logs v-else-if="tab === 3" :type="'out'"></Logs>
      <Logs v-else-if="tab === 4" :type="'error'"></Logs>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'
  import { BrewStore } from '@/store/brew'
  import { join } from '@/util/path-browserify'
  import { shell, fs } from '@/util/NodeFn'

  const { tab, checkVersion } = AppModuleSetup('zincsearch')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log'),
    I18nT('common.label.errorLog')
  ]
  checkVersion()

  const brewStore = BrewStore()
  const isRunning = computed(() => {
    return brewStore.module('zincsearch').installed.some((m) => m.run)
  })

  const parseEnv = (content: string) => {
    const env: Record<string, string> = {}
    content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .forEach((line) => {
        const index = line.indexOf('=')
        if (index > 0) {
          env[line.substring(0, index).trim()] = line
            .substring(index + 1)
            .trim()
            .replace(/^['"]|['"]$/g, '')
        }
      })
    return env
  }

  const openURL = async () => {
    const envFile = join(window.Server.BaseDir!, 'zincsearch/zincsearch.env')
    let host = '127.0.0.1'
    let port = '4080'
    if (await fs.existsSync(envFile)) {
      const env = parseEnv(await fs.readFile(envFile))
      port = env.ZINC_SERVER_PORT || port
      host = env.ZINC_SERVER_ADDRESS || host
      if (host === '0.0.0.0' || host === '::') {
        host = '127.0.0.1'
      }
    }
    shell.openExternal(`http://${host}:${port}/`).then().catch()
  }
</script>
