import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'
import { NodejsStore } from '../node'
import { waitTime } from '@web/fn'

export const NVMSetup = reactive<{
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
  const xtermDom = ref<HTMLElement>()

  const hasBrew = !!global.Server.BrewCellar
  const hasPort = !!global.Server.MacPorts

  const fetchLocal = () => {
    if (NVMSetup.local.length > 0 || NVMSetup.fetching) {
      return
    }
    NVMSetup.fetching = true
    waitTime().then(() => {
      import('@web/config/node').then((res) => {
        NVMSetup.local.splice(0)
        NVMSetup.current = ''
        NVMSetup.local = JSON.parse(JSON.stringify(res.NodeJSLocal.local))
        NVMSetup.current = res.NodeJSLocal.current
        NVMSetup.fetching = false
      })
    })
  }

  const reFetch = () => {
    NVMSetup.fetching = false
    NVMSetup.local.splice(0)
    NVMSetup.current = ''
    fetchLocal()
  }

  NVMSetup.reFetch = reFetch

  const versionChange = (item: any) => {
    if (NVMSetup.switching) {
      return
    }
    NVMSetup.switching = true
    item.switching = true
    waitTime().then(() => {
      NVMSetup.current = item.version
      MessageSuccess(I18nT('base.success'))
      item.switching = false
      NVMSetup.switching = false
    })
  }

  const installOrUninstall = (action: 'install' | 'uninstall', item: any) => {
    item.installing = true
    waitTime().then(() => {
      if (action === 'install') {
        NVMSetup.local.push(item.version)
      } else {
        const index = NVMSetup.local.findIndex((f) => f === item.version)
        if (index >= 0) {
          NVMSetup.local.splice(index, 1)
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
      NVMSetup.local.map((v) => {
        return {
          version: v,
          installed: true
        }
      }) ?? []
    const remotas =
      store.all
        .filter((a) => !NVMSetup.local.includes(a))
        .map((v) => {
          return {
            version: v,
            installed: false
          }
        }) ?? []
    const list = [...locals, ...remotas]
    if (!NVMSetup.search) {
      return list
    }
    return list.filter(
      (v) => v.version.includes(NVMSetup.search) || NVMSetup.search.includes(v.version)
    )
  })

  const showInstall = computed(() => {
    return !store.checking && (!store.tool || store.tool === 'fnm')
  })
  const installNVM = async () => {}

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
    installNVM,
    tableData
  }
}
