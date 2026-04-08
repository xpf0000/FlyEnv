<template>
  <el-card class="app-base-el-card">
    <!-- Checking -->
    <div v-if="checking" class="flex justify-center items-center w-full h-full gap-3">
      <el-icon class="is-loading text-xl"><Loading /></el-icon>
      <span class="text-gray-500">{{ I18nT('mkcert.checking') }}</span>
    </div>

    <!-- Installing binary with XTerm -->
    <template v-else-if="MkCertStore.installing">
      <div class="w-full h-full overflow-hidden p-5">
        <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
      </div>
    </template>

    <!-- Installed -->
    <template v-else-if="installed">
      <el-alert type="success" :closable="false" show-icon class="mb-6">
        <template #title>
          <span class="font-semibold"
            >mkcert {{ mkcertVersion }} {{ I18nT('mkcert.isInstalled') }}</span
          >
        </template>
        <template #default>
          <span
            class="text-sm text-gray-500 cursor-pointer hover:text-yellow-500"
            @click.stop="shell.showItemInFolder(binPath)"
            >{{ binPath }}</span
          >
        </template>
      </el-alert>

      <!-- CA Root info -->
      <div v-if="caroot" class="mb-8">
        <p class="text-sm text-gray-500 mb-2">{{ I18nT('mkcert.carootLabel') }}</p>
        <div
          class="flex items-center gap-2 bg-gray-100 dark:bg-[#2a2d3e] rounded px-3 py-2 font-mono text-xs"
        >
          <span
            class="flex-1 truncate cursor-pointer hover:text-yellow-500"
            @click.stop="shell.openPath(caroot)"
            >{{ caroot }}</span
          >
          <div class="flex-shrink-0 flex items-center">
            <el-button :icon="CopyDocument" link @click.stop="copyPath(caroot)"></el-button>
            <el-button :icon="FolderOpened" link @click.stop="shell.openPath(caroot)"></el-button>
          </div>
        </div>
      </div>

      <div class="flex gap-3 flex-wrap">
        <el-button type="primary" size="small" @click="doInstallCA">
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

    <!-- Footer buttons for installing -->
    <template #footer>
      <template v-if="MkCertStore.installing">
        <template v-if="MkCertStore.installEnd">
          <el-button type="primary" @click.stop="taskConfirm">{{
            I18nT('base.confirm')
          }}</el-button>
        </template>
        <template v-else>
          <el-button @click.stop="taskCancel">{{ I18nT('base.cancel') }}</el-button>
        </template>
      </template>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { ref, nextTick, onMounted, onUnmounted } from 'vue'
  import { CopyDocument, FolderOpened, Loading } from '@element-plus/icons-vue'
  import IPC from '@/util/IPC'
  import MkCertStore from '@/components/MkCert/MkCertStore'
  import { I18nT } from '@lang/index'
  import { clipboard, shell } from '@/util/NodeFn'
  import { MessageSuccess } from '@/util/Element'
  import XTerm from '@/util/XTerm'

  const checking = ref(true)
  const installed = ref(false)
  const mkcertVersion = ref('')
  const binPath = ref('')
  const caroot = ref('')
  const xtermDom = ref<HTMLElement>()

  const copyPath = (path: string) => {
    clipboard.writeText(path).then(() => {
      MessageSuccess(I18nT('base.copySuccess'))
    })
  }

  const fetchCAROOT = () => {
    IPC.send('app-fork:mkcert', 'getCAROOT', { mkcertBin: MkCertStore.mkcertBin }).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          caroot.value = res.data?.caroot ?? ''
          MkCertStore.caroot = res.data?.caroot ?? ''
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
        MkCertStore.mkcertBin = res.data.bin ?? MkCertStore.mkcertBin
        MkCertStore.save()
        fetchCAROOT()
      } else {
        installed.value = false
      }
      checking.value = false
    })
  }

  const emits = defineEmits(['toVersionTab'])

  const doInstall = () => {
    emits('toVersionTab')
  }

  const doInstallCA = () => {
    MkCertStore.installCA(xtermDom as any, binPath.value)
  }

  const taskConfirm = () => {
    MkCertStore.taskConfirm()
    checkInstall()
  }

  const taskCancel = () => {
    MkCertStore.taskCancel()
  }

  onMounted(() => {
    checkInstall()
    // Handle remounting xterm if component remounts during installation
    if (MkCertStore.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = MkCertStore.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
  })

  onUnmounted(() => {
    MkCertStore.onUnmounted()
  })
</script>
