<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span>n8n</span>
          <el-button
            class="button"
            link
            @click="openURL('https://docs.n8n.io/hosting/installation/npm/')"
          >
            <yb-icon
              style="width: 20px; height: 20px; margin-left: 10px"
              :svg="import('@/svg/http.svg?raw')"
            ></yb-icon>
          </el-button>
        </div>
        <el-button
          class="button"
          :disabled="setup.installing || setup.fetching"
          link
          @click="doFetch"
        >
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': setup.fetching }"
          ></yb-icon>
        </el-button>
      </div>
    </template>

    <!-- xterm terminal shown while installing -->
    <template v-if="setup.installing">
      <div class="w-full h-full overflow-hidden p-2">
        <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
      </div>
    </template>

    <!-- version table -->
    <template v-else>
      <el-table
        show-overflow-tooltip
        height="100%"
        :data="setup.versions"
        :border="false"
        style="width: 100%"
      >
        <template #empty>
          <template v-if="setup.fetching">{{ I18nT('base.gettingVersion') }}</template>
          <template v-else>{{ I18nT('util.noVerionsFoundInLib') }}</template>
        </template>
        <el-table-column prop="version" :label="I18nT('base.version')">
          <template #default="scope">
            <span class="pl-6">{{ scope.row.version }}</span>
          </template>
        </el-table-column>
        <el-table-column align="center" :label="I18nT('base.isInstalled')" width="150">
          <template #default="scope">
            <div class="cell-status">
              <yb-icon
                v-if="scope.row.installed"
                :svg="import('@/svg/ok.svg?raw')"
                class="installed"
              ></yb-icon>
            </div>
          </template>
        </el-table-column>
        <el-table-column align="center" :label="I18nT('base.action')" width="150">
          <template #default="scope">
            <el-button
              type="primary"
              link
              :disabled="setup.installing"
              @click.stop="doAction(scope.row)"
            >
              {{ scope.row.installed ? I18nT('base.uninstall') : I18nT('base.install') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <template v-if="setup.installing" #footer>
      <template v-if="setup.installEnd">
        <el-button type="primary" @click.stop="onConfirm">{{ I18nT('base.confirm') }}</el-button>
      </template>
      <template v-else>
        <el-button @click.stop="onCancel">{{ I18nT('base.cancel') }}</el-button>
      </template>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { ref, reactive, nextTick, onMounted, onUnmounted } from 'vue'
  import { I18nT } from '@lang/index'
  import { shell } from '@/util/NodeFn'
  import XTerm from '@/util/XTerm'
  import IPC from '@/util/IPC'
  import { BrewStore } from '@/store/brew'

  const xtermDom = ref<HTMLElement>()

  const setup = reactive<{
    fetching: boolean
    installing: boolean
    installEnd: boolean
    versions: Array<{ version: string; mVersion: string; url: string; installed: boolean }>
    xterm: XTerm | undefined
  }>({
    fetching: false,
    installing: false,
    installEnd: false,
    versions: [],
    xterm: undefined
  })

  const openURL = (url: string) => {
    shell.openExternal(url).catch()
  }

  const doFetch = () => {
    if (setup.fetching) return
    setup.fetching = true
    IPC.send('app-fork:n8n', 'fetchAllOnlineVersion').then((key: string, res: any) => {
      IPC.off(key)
      const online: any[] = res?.data ?? []
      // merge with installed state
      const brewStore = BrewStore()
      const installed = brewStore.module('n8n').installed
      setup.versions = online.map((v) => ({
        ...v,
        installed: installed.some((i) => i.version === v.version)
      }))
      setup.fetching = false
    })
  }

  const doAction = (row: any) => {
    const action = row.installed ? 'uninstall' : 'install'
    const commands: string[] = []
    if (window.Server.isWindows) {
      if (window.Server.Proxy) {
        for (const k in window.Server.Proxy) {
          commands.push(`$env:${k}="${(window.Server.Proxy as any)[k]}"`)
        }
      }
      commands.push(`npm ${action} -g n8n@${row.version}`)
    } else {
      if (window.Server.Proxy) {
        for (const k in window.Server.Proxy) {
          commands.push(`export ${k}="${(window.Server.Proxy as any)[k]}"`)
        }
      }
      commands.push(`npm ${action} -g n8n@${row.version}`)
    }

    setup.installEnd = false
    setup.installing = true

    nextTick(() => {
      const xterm = new XTerm()
      setup.xterm = xterm
      xterm.mount(xtermDom.value!).then(() => {
        xterm.send(commands, false).then(() => {
          setup.installEnd = true
        })
      })
    })
  }

  const onConfirm = () => {
    setup.installing = false
    setup.installEnd = false
    setup.xterm?.destroy()
    setup.xterm = undefined
    // Use fetchInstalled() so items are wrapped as ModuleInstalledItem instances (with .start()/.stop())
    const brewStore = BrewStore()
    const mod = brewStore.module('n8n')
    mod.installedFetched = false
    mod.fetchInstalled().then(() => {
      const installed = mod.installed
      setup.versions = setup.versions.map((v) => ({
        ...v,
        installed: installed.some((i: any) => i.version === v.version)
      }))
    })
  }

  const onCancel = () => {
    setup.installing = false
    setup.installEnd = false
    setup.xterm?.stop()?.then(() => {
      setup.xterm?.destroy()
      setup.xterm = undefined
    })
  }

  onMounted(() => {
    doFetch()
    if (setup.installing && setup.xterm && xtermDom.value) {
      setup.xterm.mount(xtermDom.value).catch()
    }
  })

  onUnmounted(() => {
    setup.xterm?.unmounted?.()
  })
</script>
