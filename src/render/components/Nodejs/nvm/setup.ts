import { computed, reactive } from 'vue'
import IPC from '@/util/IPC'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { NodejsStore } from '@/components/Nodejs/node'

export const NVMSetup = reactive<{
  fetching: boolean
  switching?: string
  local: Array<string>
  current: string
  reFetch: () => void
  search: string
}>({
  fetching: false,
  switching: undefined,
  local: [],
  current: '',
  reFetch: () => 0,
  search: ''
})

export const Setup = () => {
  const store = NodejsStore()

  const fetchLocal = () => {
    if (NVMSetup.local.length > 0 || NVMSetup.fetching) {
      return
    }
    NVMSetup.fetching = true
    IPC.send('app-fork:node', 'localVersion', 'nvm').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        NVMSetup.local.splice(0)
        const list = res?.data?.versions ?? []
        NVMSetup.local.push(...list)
        NVMSetup.current = res?.data?.current ?? ''
      }
      NVMSetup.fetching = false
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
    NVMSetup.switching = item.version
    IPC.send('app-fork:node', 'versionChange', 'nvm', item.version).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          NVMSetup.current = item.version
          MessageSuccess(I18nT('base.success'))
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        NVMSetup.switching = undefined
      }
    )
  }

  const installOrUninstall = (action: 'install' | 'uninstall', item: any) => {
    item.installing = true
    IPC.send('app-fork:node', 'installOrUninstall', 'nvm', action, item.version).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          NVMSetup.current = res?.data?.current ?? ''
          const list = res?.data?.versions ?? []
          NVMSetup.local.splice(0)
          NVMSetup.local.push(...list)
          MessageSuccess(I18nT('base.success'))
        } else {
          MessageError(I18nT('base.fail'))
        }
        item.installing = false
      }
    )
  }

  const tableData = computed(() => {
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

  fetchLocal()

  return {
    fetchLocal,
    versionChange,
    installOrUninstall,
    tableData
  }
}
