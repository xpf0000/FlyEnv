<template>
  <div class="p-6 max-w-3xl">
    <!-- Not installed warning -->
    <el-alert
      v-if="!isInstalled"
      type="warning"
      :closable="false"
      show-icon
      :title="I18nT('mkcert.notInstalled')"
      class="mb-5"
    />

    <!-- No SSL hosts -->
    <el-empty v-else-if="sslHosts.length === 0" :description="I18nT('mkcert.noSSLHosts')" />

    <!-- SSL hosts list -->
    <template v-else>
      <div v-for="host in sslHosts" :key="host.name" class="mb-6 border rounded-lg p-4">
        <div class="flex items-center justify-between mb-3">
          <span class="font-semibold text-base">{{ host.name }}</span>
          <el-button
            type="primary"
            size="small"
            :loading="generatingMap[host.name]"
            @click="doGenerate(host)"
          >
            {{ I18nT('mkcert.generate') }}
          </el-button>
        </div>

        <!-- Cert/Key paths -->
        <div class="text-xs text-gray-500 space-y-1 mb-3">
          <div>
            <span class="font-medium">cert: </span>
            <span class="font-mono">{{ host.ssl?.cert || '-' }}</span>
          </div>
          <div>
            <span class="font-medium">key: </span>
            <span class="font-mono">{{ host.ssl?.key || '-' }}</span>
          </div>
        </div>

        <!-- Log output per host -->
        <div
          v-if="logMap[host.name]"
          class="bg-black text-green-400 rounded p-3 font-mono text-xs h-32 overflow-y-auto whitespace-pre-wrap"
          >{{ logMap[host.name] }}</div
        >
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
  import { computed, reactive } from 'vue'
  import { AppStore } from '@/store/app'
  import IPC from '@/util/IPC'
  import MkCertStore from '@/components/MkCert/MkCertStore'
  import { I18nT } from '@lang/index'
  import type { AppHost } from '@shared/app'

  const appStore = AppStore()

  const isInstalled = computed(() => !!MkCertStore.mkcertVersion)

  const sslHosts = computed(() => {
    return (appStore.hosts as AppHost[]).filter((h) => h.useSSL)
  })

  const generatingMap = reactive<Record<string, boolean>>({})
  const logMap = reactive<Record<string, string>>({})

  const doGenerate = (host: AppHost) => {
    if (!host.ssl?.cert || !host.ssl?.key) return
    generatingMap[host.name] = true
    logMap[host.name] = ''

    IPC.send('app-fork:mkcert', 'generateCert', {
      mkcertBin: MkCertStore.mkcertBin,
      certFile: host.ssl.cert,
      keyFile: host.ssl.key,
      domains: [host.name]
    }).then((key: string, res: any) => {
      if (res?.code === 200) {
        logMap[host.name] += res.msg ?? res.data ?? ''
        return
      }
      IPC.off(key)
      generatingMap[host.name] = false
      if (res?.code !== 0) {
        logMap[host.name] += `\nError: ${res?.msg ?? 'failed'}`
      }
    })
  }
</script>
