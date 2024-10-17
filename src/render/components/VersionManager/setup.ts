import { computed, ComputedRef, nextTick, onUnmounted, ref, watch } from 'vue'
import { AppStore } from '@/store/app'
import { AppSoftInstalledItem, BrewStore } from '@/store/brew'
import XTerm from '@/util/XTerm'
import { I18nT } from '@shared/lang'
import IPC from '@/util/IPC'
import { staticVersionDel } from '@/util/Version'
import type { AllAppModule } from '@/core/type'
import installedVersions from '@/util/InstalledVersions'

export const Setup = (typeFlag: AllAppModule) => {
  const appStore = AppStore()
  const brewStore = BrewStore()

  const showNextBtn = ref(false)
  const logs = ref()
  let xterm: XTerm | null = null

  const proxy = computed(() => {
    return appStore.config.setup.proxy
  })
  const cardHeadTitle = computed(() => {
    return brewStore.cardHeadTitle
  })
  const brewRunning = computed(() => {
    return brewStore.brewRunning
  })
  const showInstallLog = computed(() => {
    return brewStore.showInstallLog
  })
  const log = computed(() => {
    return brewStore.log
  })
  const proxyStr = computed(() => {
    if (!proxy?.value.on) {
      return undefined
    }
    return proxy?.value?.proxy
  })
  const logLength = computed(() => {
    return log?.value?.length
  })
  const showLog = computed(() => {
    return showInstallLog?.value || showNextBtn?.value
  })

  const toNext = () => {
    showNextBtn.value = false
    BrewStore().cardHeadTitle = I18nT('base.currentVersionLib')
  }

  const currentType: ComputedRef<AppSoftInstalledItem> = computed(() => {
    return brewStore.module(typeFlag)
  })

  const checkBrew = () => {
    return !!global.Server.BrewCellar
  }
  const checkPort = () => {
    return !!global.Server.MacPorts
  }

  const libSrc = computed({
    get(): 'brew' | 'port' | 'static' | undefined {
      return (
        brewStore.LibUse[typeFlag] ??
        (checkBrew()
          ? 'brew'
          : checkPort()
            ? 'port'
            : ['php', 'caddy', 'tomcat'].includes(typeFlag)
              ? 'static'
              : undefined)
      )
    },
    set(v: 'brew' | 'port' | 'static') {
      brewStore.LibUse[typeFlag] = v
    }
  })

  const reGetData = () => {
    if (!libSrc?.value) {
      return
    }
    const list = currentType.value.list?.[libSrc.value]
    for (const k in list) {
      delete list[k]
    }
    getData()
  }

  const regetInstalled = () => {
    brewStore.showInstallLog = false
    brewStore.brewRunning = false
    currentType.value.installedInited = false
    reGetData()
    installedVersions.allInstalledVersions([typeFlag])
  }

  const handleEditDown = (row: any, installed: boolean) => {
    console.log('row: ', row, installed)
    if (!installed) {
      if (row.downing) {
        return
      }
      row.downing = true
      row.type = typeFlag
      IPC.send(`app-fork:${typeFlag}`, 'installSoft', JSON.parse(JSON.stringify(row))).then(
        (key: string, res: any) => {
          console.log('res: ', res)
          if (res?.code === 200) {
            Object.assign(row, res.msg)
          } else if (res?.code === 0) {
            IPC.off(key)
            if (res?.data) {
              regetInstalled()
            }
            row.downing = false
          }
        }
      )
    } else {
      staticVersionDel(row.appDir)
    }
  }

  watch(
    showLog,
    (val) => {
      nextTick().then(() => {
        if (val) {
          const dom = logs?.value
          xterm = new XTerm()
          xterm.mount(dom)
        } else {
          xterm && xterm.destory()
          xterm = null
        }
      })
    },
    {
      immediate: true
    }
  )

  watch(logLength, () => {
    if (showInstallLog?.value) {
      nextTick().then(() => {
        const container: HTMLElement = logs?.value as any
        if (container) {
          container.scrollTop = container.scrollHeight
        }
      })
    }
  })

  if (!brewRunning?.value) {
    brewStore.cardHeadTitle = I18nT('base.currentVersionLib')
  }

  onUnmounted(() => {
    xterm && xterm.destory()
    xterm = null
  })
}
