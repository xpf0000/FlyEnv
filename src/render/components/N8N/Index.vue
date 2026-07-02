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

  const parseEnvValue = (content: string, key: string) => {
    const match = content
      .split(/\r?\n/)
      .find((line: string) => line.trim().startsWith(`${key}=`))
    const raw = match?.trim().split('=').slice(1).join('=').trim()
    return raw?.replace(/^['"]|['"]$/g, '')
  }

  const normalizeUrlPath = (value?: string) => {
    if (!value) return '/'
    return value.startsWith('/') ? value : `/${value}`
  }

  const openDashboard = async () => {
    let protocol = 'http'
    let host = '127.0.0.1'
    let port = '5678'
    let path = '/'
    try {
      const envFile = join(window.Server.BaseDir!, 'n8n/n8n.env')
      const content = await fs.readFile(envFile)
      protocol = parseEnvValue(content as string, 'N8N_PROTOCOL') || protocol
      host = parseEnvValue(content as string, 'N8N_HOST') || host
      port = parseEnvValue(content as string, 'N8N_PORT') || port
      path = normalizeUrlPath(parseEnvValue(content as string, 'N8N_PATH') || path)
    } catch {}
    if (host === '0.0.0.0' || host === '::') {
      host = '127.0.0.1'
    }
    shell.openExternal(`${protocol}://${host}:${port}${path}`).catch()
  }

  checkVersion()
</script>
