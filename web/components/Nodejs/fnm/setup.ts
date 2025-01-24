import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'
import { NodejsStore } from '../node'
import { AppStore } from '@web/store/app'
import { waitTime } from '@web/fn'

export const FNMSetup = reactive<{
  installed: boolean
  installEnd: boolean
  installing: boolean
  fetching: boolean
  switching: boolean
  local: Array<string>
  current: string
  xterm: any
  reFetch: () => void
  installLib: 'shell' | 'brew' | 'port'
  search: string
}>({
  installed: false,
  installEnd: false,
  installing: false,
  fetching: false,
  switching: false,
  local: [],
  current: '',
  xterm: undefined,
  reFetch: () => 0,
  installLib: 'shell',
  search: ''
})

export const Setup = () => {
  const store = NodejsStore()
  const appStore = AppStore()

  const xtermDom = ref<HTMLElement>()

  const hasBrew = !!global.Server.BrewCellar
  const hasPort = !!global.Server.MacPorts

  const fetchLocal = () => {
    if (FNMSetup.local.length > 0 || FNMSetup.fetching) {
      return
    }
    FNMSetup.fetching = true
    waitTime().then(() => {
      import('@web/config/node').then((res) => {
        FNMSetup.local.splice(0)
        FNMSetup.current = ''
        FNMSetup.local = JSON.parse(JSON.stringify(res.NodeJSLocal.local))
        FNMSetup.current = res.NodeJSLocal.current
        FNMSetup.fetching = false
      })
    })
  }

  const reFetch = () => {
    FNMSetup.fetching = false
    FNMSetup.local.splice(0)
    FNMSetup.current = ''
    fetchLocal()
  }

  FNMSetup.reFetch = reFetch

  const versionChange = (item: any) => {
    if (FNMSetup.switching) {
      return
    }
    FNMSetup.switching = true
    item.switching = true
    waitTime().then(() => {
      FNMSetup.current = item.version
      MessageSuccess(I18nT('base.success'))
      item.switching = false
      FNMSetup.switching = false
    })
  }

  const installOrUninstall = (action: 'install' | 'uninstall', item: any) => {
    item.installing = true
    waitTime().then(() => {
      if (action === 'install') {
        FNMSetup.local.push(item.version)
      } else {
        const index = FNMSetup.local.findIndex((f) => f === item.version)
        if (index >= 0) {
          FNMSetup.local.splice(index, 1)
        }
      }
      MessageSuccess(I18nT('base.success'))
      item.installing = false
    })
  }

  const tableData = computed(() => {
    if (showInstall.value) {
      return []
    }
    const locals =
      FNMSetup.local.map((v) => {
        return {
          version: v,
          installed: true
        }
      }) ?? []
    const remotas =
      store.all
        .filter((a) => !FNMSetup.local.includes(a))
        .map((v) => {
          return {
            version: v,
            installed: false
          }
        }) ?? []
    const list = [...locals, ...remotas]
    if (!FNMSetup.search) {
      return list
    }
    return list.filter(
      (v) => v.version.includes(FNMSetup.search) || FNMSetup.search.includes(v.version)
    )
  })

  const showInstall = computed(() => {
    return !store.checking && (!store.tool || store.tool === 'nvm')
  })

  const installFNM = async () => {}

  onMounted(() => {})

  onUnmounted(() => {})

  fetchLocal()

  return {
    fetchLocal,
    versionChange,
    installOrUninstall,
    showInstall,
    xtermDom,
    hasBrew,
    hasPort,
    installFNM,
    tableData
  }
}
