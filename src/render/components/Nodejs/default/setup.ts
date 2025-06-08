import { computed, onMounted, onUnmounted, reactive } from 'vue'
import IPC from '@/util/IPC'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { NodejsStore } from '@/components/Nodejs/node'
import installedVersions from '@/util/InstalledVersions'
import { BrewStore } from '@/store/brew'
import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'

import { join } from 'path-browserify'

export const NodeDefaultSetup = reactive<{
  installing: Record<string, number>
  versionInstalling: Record<string, boolean>
  fetching: boolean
  switching: boolean
  local: Array<string>
  current: string
  reFetch: () => void
  search: string
}>({
  installing: {},
  versionInstalling: {},
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
    if (NodeDefaultSetup.local.length > 0 || NodeDefaultSetup.fetching) {
      return
    }
    NodeDefaultSetup.fetching = true
    IPC.send('app-fork:node', 'localVersion', 'default').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        NodeDefaultSetup.local.splice(0)
        const list = res?.data?.versions ?? []
        NodeDefaultSetup.local.push(...list)
        NodeDefaultSetup.current = res?.data?.current ?? ''
      }
      NodeDefaultSetup.fetching = false
    })
  }

  const reFetch = () => {
    NodeDefaultSetup.fetching = false
    NodeDefaultSetup.local.splice(0)
    NodeDefaultSetup.current = ''
    fetchLocal()
  }

  NodeDefaultSetup.reFetch = reFetch

  const versionChange = (item: any) => {
    if (NodeDefaultSetup.switching) {
      return
    }
    NodeDefaultSetup.switching = true
    item.switching = true
    const param: any = {
      bin: join(window.Server.AppDir!, `nodejs/v${item.version}/node.exe`),
      path: join(window.Server.AppDir!, `nodejs/v${item.version}`)
    }
    ServiceActionStore.updatePath(param, 'node')
      .then(() => {
        reFetch()
      })
      .finally(() => {
        item.switching = false
        NodeDefaultSetup.switching = false
      })
  }
  const brewStore = BrewStore()
  const installOrUninstall = (action: 'install' | 'uninstall', item: any) => {
    item.installing = true
    NodeDefaultSetup.versionInstalling[item.version] = true
    IPC.send('app-fork:node', 'installOrUninstall', 'default', action, item.version).then(
      (key: string, res: any) => {
        console.log('installOrUninstall res: ', res)
        if (res?.code === 0) {
          IPC.off(key)
          NodeDefaultSetup.current = res?.data?.current ?? ''
          const list = res?.data?.versions ?? []
          NodeDefaultSetup.local.splice(0)
          NodeDefaultSetup.local.push(...list)
          delete NodeDefaultSetup.installing?.[item.version]
          delete NodeDefaultSetup.versionInstalling?.[item.version]
          if (res?.data?.setEnv) {
            versionChange(item)
          }
          brewStore.module('node').installedInited = false
          installedVersions.allInstalledVersions(['node']).then()
          MessageSuccess(I18nT('base.success'))
        } else if (res?.code === 1) {
          IPC.off(key)
          delete NodeDefaultSetup.installing?.[item.version]
          delete NodeDefaultSetup.versionInstalling?.[item.version]
          MessageError(res?.msg ?? I18nT('base.fail'))
        } else if (typeof res?.msg?.progress === 'number') {
          NodeDefaultSetup.installing[item.version] = res?.msg?.progress
          console.log(
            'NodeDefaultSetup.installing[item.version]: ',
            NodeDefaultSetup.installing[item.version]
          )
        }
        item.installing = false
      }
    )
  }

  const tableData = computed(() => {
    const locals =
      NodeDefaultSetup.local.map((v) => {
        return {
          version: v,
          installed: true
        }
      }) ?? []
    const remotas =
      store.all
        .filter((a) => !NodeDefaultSetup.local.includes(a))
        .map((v) => {
          return {
            version: v,
            installed: false
          }
        }) ?? []
    const list = [...locals, ...remotas]
    if (!NodeDefaultSetup.search) {
      return reactive(list)
    }
    return reactive(
      list.filter(
        (v) =>
          v.version.includes(NodeDefaultSetup.search) || NodeDefaultSetup.search.includes(v.version)
      )
    )
  })

  onMounted(() => {})

  onUnmounted(() => {})

  fetchLocal()

  return {
    fetchLocal,
    versionChange,
    installOrUninstall,
    tableData
  }
}
