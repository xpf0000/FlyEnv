<template>
  <div class="setup-panel p-6 max-w-2xl">
    <!-- Checking -->
    <div v-if="checking" class="flex items-center gap-3 py-10">
      <el-icon class="is-loading text-xl"><Loading /></el-icon>
      <span class="text-gray-500">{{ I18nT('mkcert.checking') }}</span>
    </div>

    <!-- Installing binary -->
    <template v-else-if="installing">
      <p class="text-sm font-semibold mb-2">{{ I18nT('mkcert.installing') }}</p>
      <div
        ref="logEl"
        class="bg-black text-green-400 rounded p-3 font-mono text-xs h-48 overflow-y-auto whitespace-pre-wrap"
        >{{ installLog }}</div
      >
    </template>

    <!-- Installing CA -->
    <template v-else-if="installingCA">
      <p class="text-sm font-semibold mb-2">{{ I18nT('mkcert.installingCA') }}</p>
      <div
        ref="caLogEl"
        class="bg-black text-green-400 rounded p-3 font-mono text-xs h-48 overflow-y-auto whitespace-pre-wrap"
        >{{ caLog }}</div
      >
    </template>

    <!-- Installed -->
    <template v-else-if="installed">
      <el-alert type="success" :closable="false" show-icon class="mb-4">
        <template #title>
          <span class="font-semibold"
            >mkcert {{ mkcertVersion }} {{ I18nT('mkcert.isInstalled') }}</span
          >
        </template>
        <template #default>
          <span class="text-sm text-gray-500">{{ binPath }}</span>
        </template>
      </el-alert>

      <!-- CA Root info -->
      <div v-if="caroot" class="mb-4">
        <p class="text-sm text-gray-500 mb-1">{{ I18nT('mkcert.carootLabel') }}</p>
        <div
          class="flex items-center gap-2 bg-gray-100 dark:bg-[#2a2d3e] rounded px-3 py-2 font-mono text-xs"
        >
          <span class="flex-1 break-all select-all">{{ caroot }}</span>
        </div>
      </div>

      <div class="flex gap-3 flex-wrap">
        <el-button type="primary" size="small" :loading="installingCA" @click="doInstallCA">
          {{ I18nT('mkcert.installCA') }}
        </el-button>
        <el-button size="small" @click="checkInstall">{{ I18nT('mkcert.recheck') }}</el-button>
      </div>
    </template>

    <!-- Not Installed -->
    <template v-else>
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        :title="I18nT('mkcert.notInstalled')"
        class="mb-5"
      />
      <div class="flex gap-3">
        <el-button type="primary" size="small" @click="doInstall">
          {{ I18nT('mkcert.install') }}
        </el-button>
        <el-button size="small" @click="checkInstall">{{ I18nT('mkcert.checkAgain') }}</el-button>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
  import { ref, nextTick, onMounted } from 'vue'
  import { Loading } from '@element-plus/icons-vue'
  import IPC from '@/util/IPC'
  import MkCertStore from '@/core/MkCert/MkCertStore'
  import { I18nT } from '@lang/index'

  const checking = ref(true)
  const installing = ref(false)
  const installingCA = ref(false)
  const installed = ref(false)
  const mkcertVersion = ref('')
  const binPath = ref('')
  const caroot = ref('')
  const installLog = ref('')
  const caLog = ref('')
  const logEl = ref<HTMLElement>()
  const caLogEl = ref<HTMLElement>()

  const fetchCAROOT = () => {
    IPC.send('app-fork:mkcert', 'getCAROOT', { mkcertBin: MkCertStore.mkcertBin }).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          caroot.value = res.data?.caroot ?? ''
        }
      }
    )
  }

  const checkInstall = () => {
    checking.value = true
    installed.value = false
    mkcertVersion.value = ''
    binPath.value = ''
    caroot.value = ''

    IPC.send('app-fork:mkcert', 'checkBin', {
      mkcertBin: MkCertStore.mkcertBin || 'mkcert'
    }).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0 && res.data?.found) {
        installed.value = true
        mkcertVersion.value = res.data.version ?? ''
        binPath.value = res.data.bin ?? MkCertStore.mkcertBin
        MkCertStore.mkcertVersion = res.data.version ?? ''
        fetchCAROOT()
      } else {
        installed.value = false
      }
      checking.value = false
    })
  }

  const doInstall = () => {
    installing.value = true
    installLog.value = ''

    IPC.send('app-fork:mkcert', 'installLatest', {}).then((key: string, res: any) => {
      if (res?.code === 200) {
        installLog.value += res.msg ?? res.data ?? ''
        nextTick().then(() => {
          if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
        })
        return
      }
      IPC.off(key)
      installing.value = false
      if (res?.code === 0) {
        const bin = res.data?.bin
        if (bin) {
          MkCertStore.mkcertBin = bin
          MkCertStore.save()
        }
        checkInstall()
      } else {
        installLog.value += `\nError: ${res?.msg ?? 'install failed'}`
        checking.value = false
      }
    })
  }

  const doInstallCA = () => {
    installingCA.value = true
    caLog.value = ''

    IPC.send('app-fork:mkcert', 'installCA', { mkcertBin: MkCertStore.mkcertBin }).then(
      (key: string, res: any) => {
        if (res?.code === 200) {
          caLog.value += res.msg ?? res.data ?? ''
          nextTick().then(() => {
            if (caLogEl.value) caLogEl.value.scrollTop = caLogEl.value.scrollHeight
          })
          return
        }
        IPC.off(key)
        installingCA.value = false
        if (res?.code !== 0) {
          caLog.value += `\nError: ${res?.msg ?? 'failed'}`
        }
      }
    )
  }

  onMounted(() => {
    checkInstall()
  })
</script>
