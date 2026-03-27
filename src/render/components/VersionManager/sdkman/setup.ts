import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import type { AllAppModule } from '@/core/type'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { clipboard } from '@/util/NodeFn'

export const SdkmanSetup = reactive<{
  installEnd: boolean
  installing: boolean
  xterm: XTerm | undefined
  checkSdkman: () => void
  reFetch: () => void
}>({
  installEnd: false,
  installing: false,
  xterm: undefined,
  reFetch: () => 0,
  checkSdkman() {
    if (!window.Server.SdkmanHome) {
      IPC.send('app-check-brewport').then((key: string) => {
        IPC.off(key)
      })
    }
  }
})

export const Setup = (typeFlag: AllAppModule) => {
  const appStore = AppStore()
  const brewStore = BrewStore()

  const checkSdkman = computed(() => {
    if (!appStore.envIndex) {
      return false
    }
    return !!window.Server.SdkmanHome
  })

  const fetching = computed(() => {
    const module = brewStore.module(typeFlag)
    return module.sdkmanFetching
  })

  const fetchData = () => {
    const module = brewStore.module(typeFlag)
    if (module.sdkmanFetching) {
      return
    }
    module.fetchSdkman()
  }
  const getData = () => {
    if (!checkSdkman.value || fetching.value) {
      return
    }
    const module = brewStore.module(typeFlag)
    if (module.sdkman.length === 0) {
      fetchData()
    }
  }

  const reGetData = () => {
    brewStore.module(typeFlag).sdkman.splice(0)
    getData()
  }

  SdkmanSetup.reFetch = reGetData

  const regetInstalled = () => {
    reGetData()
    const module = brewStore.module(typeFlag)
    module.installedFetched = false
    module.fetchInstalled().catch()
  }

  const fetchCommand = (row: any) => {
    const fn = row.installed ? 'uninstall' : 'install'
    const candidate = typeFlag === 'java' ? 'java' : 'maven'
    const target = row.identifier || row.version
    return `sdk ${fn} ${candidate} ${target}`
  }

  const copyCommand = (row: any) => {
    const command = fetchCommand(row)
    clipboard.writeText(command)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const handleVersion = async (row: any) => {
    if (SdkmanSetup.installing) {
      return
    }
    SdkmanSetup.installing = true
    SdkmanSetup.installEnd = false
    const fn = row.installed ? 'uninstall' : 'install'
    const candidate = typeFlag === 'java' ? 'java' : 'maven'
    const target = row.identifier || row.version
    const sdkmanHome = window.Server.SdkmanHome
    const initCmd = `source "${sdkmanHome}/bin/sdkman-init.sh"`
    const params = [`${initCmd} && sdk ${fn} ${candidate} ${target}`]
    const proxyStr = appStore.config.setup.proxy?.proxy
    if (proxyStr) {
      params.unshift(proxyStr)
    }
    await nextTick()
    const execXTerm = new XTerm()
    SdkmanSetup.xterm = execXTerm
    await execXTerm.mount(xtermDom.value!)
    await execXTerm.send(params)
    SdkmanSetup.installEnd = true
    regetInstalled()
  }

  const tableData = computed(() => {
    const list = brewStore.module(typeFlag).sdkman
    const arr = [...list]
    return arr
  })

  const xtermDom = ref<HTMLElement>()

  getData()

  watch(checkSdkman, (v, ov) => {
    if (!ov && v) {
      getData()
    }
  })

  onMounted(() => {
    if (SdkmanSetup.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = SdkmanSetup.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
  })

  onUnmounted(() => {
    SdkmanSetup?.xterm?.unmounted?.()
  })

  return {
    handleVersion,
    tableData,
    checkSdkman,
    reGetData,
    fetching,
    xtermDom,
    fetchCommand,
    copyCommand
  }
}
