<template>
  <div class="soft-index-panel main-right-panel mailpit-plugin">
    <div class="mailpit-plugin__header">
      <div>
        <h2>Mailpit Plugin</h2>
        <p>
          This page and its Fork backend are loaded from a FlyEnv plugin bundle. The backend reuses
          FlyEnv's real Mailpit implementation.
        </p>
      </div>
      <div class="mailpit-plugin__actions">
        <el-button :loading="loading" @click="refreshAll">Refresh</el-button>
        <el-button type="primary" @click="openMailpit">Open Mailpit UI</el-button>
      </div>
    </div>

    <el-alert
      title="This example manages the same Mailpit binaries and default ports as the built-in Mailpit module. Do not run both at the same time."
      type="warning"
      :closable="false"
      show-icon
      class="mailpit-plugin__warning"
    />

    <el-card>
      <template #header>
        <div class="mailpit-plugin__card-header">
          <span>Installed Versions</span>
          <span class="mailpit-plugin__muted">{{ status }}</span>
        </div>
      </template>

      <el-table :data="installed" v-loading="loading">
        <el-table-column prop="version" label="Version" width="140" />
        <el-table-column prop="path" label="Path" min-width="360" show-overflow-tooltip />
        <el-table-column label="Service" width="180">
          <template #default="scope">
            <el-button
              v-if="!scope.row.run"
              type="success"
              link
              :loading="scope.row.running"
              @click="start(scope.row)"
            >
              Start
            </el-button>
            <el-button
              v-else
              type="danger"
              link
              :loading="scope.row.running"
              @click="stop(scope.row)"
            >
              Stop
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && installed.length === 0" description="No Mailpit version found" />
    </el-card>

    <el-card>
      <template #header>
        <div class="mailpit-plugin__card-header">
          <span>Available Static Versions</span>
          <span class="mailpit-plugin__muted">Real data from Mailpit.fetchAllOnlineVersion()</span>
        </div>
      </template>

      <el-table :data="online.slice(0, 8)">
        <el-table-column prop="version" label="Version" width="160" />
        <el-table-column prop="url" label="Download" min-width="360" show-overflow-tooltip />
        <el-table-column label="Action" width="160">
          <template #default="scope">
            <span v-if="scope.row.installed">Installed</span>
            <el-button
              v-else
              type="primary"
              link
              :loading="installingVersion === scope.row.version"
              @click="install(scope.row)"
            >
              Install
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <div class="mailpit-plugin__grid">
      <el-card>
        <template #header>Configuration</template>
        <div class="mailpit-plugin__path">{{ configPath || 'Not initialized' }}</div>
        <el-button type="primary" link @click="initConfig">Initialize / Resolve Config</el-button>
      </el-card>

      <el-card>
        <template #header>Log File</template>
        <div class="mailpit-plugin__path">{{ logPath || 'Not available' }}</div>
        <el-button type="primary" link @click="refreshLogPath">Refresh Log Path</el-button>
      </el-card>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue'
  import IPC from '@/util/IPC'
  import { BrewStore } from '@/store/brew'

  const TYPE_FLAG = 'mailpit-plugin'
  const brewStore = BrewStore()
  const module = brewStore.module(TYPE_FLAG as any)
  const installed = computed(() => module.installed)
  const online = ref<any[]>([])
  const loading = ref(false)
  const installingVersion = ref('')
  const status = ref('')
  const configPath = ref('')
  const logPath = ref('')

  const request = <T = any>(
    fn: string,
    args: any[] = [],
    onProgress?: (info: any) => void
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      const call = IPC.send(`app-fork:${TYPE_FLAG}`, fn, ...args)
      call.then((key: string, response: any) => {
        if (response?.code === 200) {
          onProgress?.(response)
          return
        }
        IPC.off(key)
        if (response?.code === 0) {
          resolve(response.data as T)
        } else {
          reject(new Error(response?.msg?.message ?? response?.msg ?? `${fn} failed`))
        }
      })
    })
  }

  const refreshInstalled = async () => {
    module.installedFetched = false
    await module.fetchInstalled(true)
  }

  const refreshOnline = async () => {
    const list = await request<any[]>('fetchAllOnlineVersion')
    online.value = Array.isArray(list) ? list : []
  }

  const refreshLogPath = async () => {
    logPath.value = (await request<string>('fetchLogPath')) ?? ''
  }

  const initConfig = async () => {
    configPath.value = (await request<string>('initConfig')) ?? ''
    await refreshLogPath()
  }

  const refreshAll = async () => {
    loading.value = true
    status.value = 'Refreshing…'
    try {
      await Promise.all([refreshInstalled(), refreshOnline(), initConfig()])
      status.value = `${installed.value.length} installed version(s)`
    } catch (error: any) {
      status.value = error?.message ?? String(error)
    } finally {
      loading.value = false
    }
  }

  const start = async (row: any) => {
    status.value = `Starting Mailpit ${row.version}…`
    const result = await row.start()
    status.value =
      typeof result === 'string' ? result : `Mailpit ${row.version} is running`
  }

  const stop = async (row: any) => {
    status.value = `Stopping Mailpit ${row.version}…`
    const result = await row.stop()
    status.value = typeof result === 'string' ? result : `Mailpit ${row.version} stopped`
  }

  const install = async (row: any) => {
    installingVersion.value = row.version
    status.value = `Installing Mailpit ${row.version}…`
    try {
      await request('installSoft', [row], (info) => {
        const message = info?.msg?.['APP-On-Log']
        if (message) status.value = typeof message === 'string' ? message : JSON.stringify(message)
      })
      await Promise.all([refreshInstalled(), refreshOnline()])
      status.value = `Mailpit ${row.version} installed`
    } catch (error: any) {
      status.value = error?.message ?? String(error)
    } finally {
      installingVersion.value = ''
    }
  }

  const openMailpit = () => {
    IPC.send('App-Node-FN', 'shell', 'openExternal', 'http://127.0.0.1:8025').then(
      (key: string) => IPC.off(key)
    )
  }

  onMounted(() => {
    refreshAll().catch(() => {})
  })
</script>

<style scoped>
  .mailpit-plugin {
    padding: 16px;
    overflow: auto;
  }

  .mailpit-plugin__header,
  .mailpit-plugin__card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .mailpit-plugin__header h2 {
    margin: 0 0 6px;
    font-size: 22px;
  }

  .mailpit-plugin__header p,
  .mailpit-plugin__muted {
    margin: 0;
    opacity: 0.65;
  }

  .mailpit-plugin__actions {
    display: flex;
    flex-shrink: 0;
    gap: 8px;
  }

  .mailpit-plugin__warning,
  .mailpit-plugin :deep(.el-card) {
    margin-top: 16px;
  }

  .mailpit-plugin__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .mailpit-plugin__path {
    min-height: 42px;
    word-break: break-all;
    opacity: 0.8;
  }
</style>
