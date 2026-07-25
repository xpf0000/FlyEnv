<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="temporal-cli" title="Temporal CLI">
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
        type-flag="temporal-cli"
        :has-static="true"
        url="https://docs.temporal.io/cli"
        title="Temporal CLI"
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
  import { BrewStore } from '@/store/brew'
  import { computed } from 'vue'
  import { join } from '@/util/path-browserify'

  const { tab, checkVersion } = AppModuleSetup('temporal-cli')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]
  checkVersion()

  const brewStore = BrewStore()
  const isRunning = computed(() => {
    return brewStore.module('temporal-cli').installed.some((m) => m.run)
  })

  const currentVersion = computed(() => {
    return brewStore.currentVersion('temporal-cli')
  })

  const openURL = async () => {
    let port = '8233'
    const v = currentVersion?.value?.version ?? ''
    if (v) {
      const confFile = join(window.Server.BaseDir!, `temporal-cli/temporal-cli-v${v}.conf`)
      const exists = await fs.existsSync(confFile)
      if (exists) {
        const content = await fs.readFile(confFile)
        const line = content.split('\n').find((s: string) => s.trim().startsWith('ui-port'))
        port = line?.split('=')?.pop()?.trim() || '8233'
      }
    }
    shell.openExternal(`http://127.0.0.1:${port}/`).then().catch()
  }
</script>
