import { computed, reactive } from 'vue'
import IPC from '@/util/IPC'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { NodejsStore } from '@/components/Nodejs/node'

export const FNMSetup = reactive<{
  fetching: boolean
  switching: boolean
  local: Array<string>
  current: string
  reFetch: () => void
  search: string
}>({
  fetching: false,
  switching: false,
  local: [],
  current: '',
  reFetch: () => 0,
  search: ''
})

export const Setup = () => {
  const store = NodejsStore()
  const fetchLocal = () => {
    if (FNMSetup.local.length > 0 || FNMSetup.fetching) {
      return
    }
    FNMSetup.fetching = true
    IPC.send('app-fork:node', 'localVersion', 'fnm').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        FNMSetup.local.splice(0)
        const list = res?.data?.versions ?? []
        FNMSetup.local.push(...list)
        FNMSetup.current = res?.data?.current ?? ''
      }
      FNMSetup.fetching = false
    })
  }

  const reFetch = () => {
    FNMSetup.fetching = false
    FNMSetup.local.splice(0)
    FNMSetup.current = ''
    fetchLocal()
    store.chekTool()?.then()?.catch()
  }

  FNMSetup.reFetch = reFetch

  const versionChange = (item: any) => {
    if (FNMSetup.switching) {
      return
    }
    FNMSetup.switching = true
    item.switching = true
    IPC.send('app-fork:node', 'versionChange', 'fnm', item.version).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          FNMSetup.current = item.version
          MessageSuccess(I18nT('base.success'))
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        item.switching = false
        FNMSetup.switching = false
      }
    )
  }

  const installOrUninstall = (action: 'install' | 'uninstall', item: any) => {
    item.installing = true
    IPC.send('app-fork:node', 'installOrUninstall', 'fnm', action, item.version).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          FNMSetup.current = res?.data?.current ?? ''
          const list = res?.data?.versions ?? []
          FNMSetup.local.splice(0)
          FNMSetup.local.push(...list)
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

  fetchLocal()

  return {
    fetchLocal,
    versionChange,
    installOrUninstall,
    tableData
  }
}
