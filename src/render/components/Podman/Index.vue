<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <el-radio-button label="Podman" value="podman"></el-radio-button>
    </el-radio-group>
    <div class="main-block relative">
      <template v-if="PodmanManager.loading">
        <div v-loading="true" class="w-full h-full overflow-hidden"></div>
      </template>
      <template v-else-if="showInstall">
        <el-card class="h-full app-base-el-card">
          <template #header>
            <div class="flex items-center justify-between gap-7 overflow-hidden">
              <template v-if="PodmanManager.installing">
                <span class="truncate">{{ I18nT('podman.installPodmanByHomebrew') }}</span>
              </template>
              <template v-else>
                <span>{{ I18nT('podman.podmanInstall') }}</span>
              </template>

              <el-button
                class="button"
                :disabled="PodmanManager.installing"
                link
                @click="PodmanManager.reinit()"
              >
                <yb-icon
                  :svg="import('@/svg/icon_refresh.svg?raw')"
                  class="refresh-icon w-[24px] h-[24px]"
                  :class="{ 'fa-spin': PodmanManager.installing }"
                ></yb-icon>
              </el-button>
            </div>
          </template>
          <template #default>
            <template v-if="PodmanManager.installing">
              <div class="w-full h-full overflow-hidden p-5">
                <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
              </div>
            </template>
            <template v-else>
              <div class="p-5 flex flex-col gap-7 items-start">
                <pre class="app-html-block" v-html="I18nT('podman.noPodmanFound')"></pre>
                <template v-if="checkBrew">
                  <el-button type="primary" @click.stop="installByHomebrew">{{
                    I18nT('podman.installPodmanByHomebrew')
                  }}</el-button>
                </template>
              </div>
            </template>
          </template>
          <template v-if="PodmanManager.installing" #footer>
            <template v-if="PodmanManager.installEnd">
              <el-button type="primary" @click.stop="taskConfirm">{{
                I18nT('base.confirm')
              }}</el-button>
            </template>
            <template v-else>
              <el-button @click.stop="taskCancel">{{ I18nT('base.cancel') }}</el-button>
            </template>
          </template>
        </el-card>
      </template>
      <template v-else-if="showNomal">
        <div class="flex h-full w-full overflow-hidden gap-3">
          <LeftVM />
          <RightVM />
        </div>
      </template>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
  import { PodmanManager } from './class/Podman'
  import { I18nT } from '@lang/index'
  import { AppStore } from '@/store/app'
  import { join } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'
  import XTerm from '@/util/XTerm'
  import LeftVM from './left.vue'
  import RightVM from './right.vue'

  const tab = ref('podman')

  PodmanManager.init()

  const showInstall = computed(() => {
    return !PodmanManager.loading && PodmanManager.inited && !PodmanManager.version
  })
  const showNomal = computed(() => {
    return !PodmanManager.loading && PodmanManager.inited && !!PodmanManager.version
  })

  const appStore = AppStore()
  const checkBrew = computed(() => {
    if (!appStore.envIndex) {
      return false
    }
    return !!window.Server.BrewCellar
  })

  const xtermDom = ref()

  const taskConfirm = () => {
    PodmanManager.installing = false
    PodmanManager.installEnd = false
    PodmanManager.xterm?.destroy()
    delete PodmanManager.xterm
    PodmanManager.reinit()
  }

  const taskCancel = () => {
    PodmanManager.installing = false
    PodmanManager.installEnd = false
    PodmanManager.xterm?.stop()?.then(() => {
      PodmanManager.xterm?.destroy()
      delete PodmanManager.xterm
    })
  }

  const installByHomebrew = async () => {
    if (PodmanManager.installing) {
      return
    }
    PodmanManager.installEnd = false
    PodmanManager.installing = true
    await nextTick()
    const execXTerm = new XTerm()
    PodmanManager.xterm = execXTerm
    await execXTerm.mount(xtermDom.value!)
    const fn = 'install'
    const arch = window.Server.isArmArch ? '-arm64' : '-x86_64'
    const name = 'podman'
    const params: string[] = []
    const sh = join(window.Server.Static!, 'sh/brew-cmd.sh')
    const copyfile = join(window.Server.Cache!, 'brew-cmd.sh')
    const exists = await fs.existsSync(copyfile)
    if (exists) {
      await fs.remove(copyfile)
    }
    await fs.copyFile(sh, copyfile)
    await fs.chmod(copyfile, '0777')
    params.push(`${copyfile} ${arch} ${fn} ${name};`)
    const proxyStr = appStore.config.setup?.proxy?.proxy
    if (proxyStr) {
      params.unshift(proxyStr)
    }
    await execXTerm.send(params)
    PodmanManager.installEnd = true
  }

  onMounted(() => {
    if (PodmanManager.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = PodmanManager.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
  })

  onUnmounted(() => {
    PodmanManager?.xterm?.unmounted?.()
  })
</script>
