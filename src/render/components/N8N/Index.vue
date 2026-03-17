<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="n8n" title="n8n">
        <template v-if="isRunning" #tool-left>
          <el-button style="color: #01cc74" class="button" link @click.stop="openDashboard">
            <yb-icon
              style="width: 20px; height: 20px; margin-left: 10px"
              :svg="import('@/svg/http.svg?raw')"
            ></yb-icon>
          </el-button>
        </template>
      </Service>
      <Manager v-else-if="tab === 1"></Manager>
      <Config v-else-if="tab === 2"></Config>
      <Users v-else-if="tab === 3"></Users>
      <Logs v-else-if="tab === 4" type="all"></Logs>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import Service from '../ServiceManager/index.vue'
  import Manager from './Manager.vue'
  import Config from './Config.vue'
  import Users from './Users.vue'
  import Logs from './Logs.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'
  import { BrewStore } from '@/store/brew'
  import { shell, fs } from '@/util/NodeFn'
  import { join } from '@/util/path-browserify'

  const { tab, checkVersion } = AppModuleSetup('n8n')

  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('n8n.usersTab'),
    I18nT('base.log')
  ]

  const brewStore = BrewStore()

  const isRunning = computed(() => {
    const current = brewStore.module('n8n').installed.find((v) => v.run)
    return !!current
  })

  const openDashboard = async () => {
    let port = '5678'
    try {
      const envFile = join(window.Server.BaseDir!, 'n8n/n8n.env')
      const content = await fs.readFile(envFile)
      const match = (content as string)
        .split('\n')
        .find((l: string) => l.trim().startsWith('N8N_PORT='))
      if (match) port = match.trim().split('=')[1]?.trim() || '5678'
    } catch {}
    shell.openExternal(`http://127.0.0.1:${port}`).catch()
  }

  checkVersion()
</script>
