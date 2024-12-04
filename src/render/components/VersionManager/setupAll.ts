import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue'
import { AppStore } from '@/store/app'
import { BrewStore, SoftInstalled } from '@/store/brew'
import XTerm from '@/util/XTerm'
import { I18nT } from '@shared/lang'
import IPC from '@/util/IPC'
import { staticVersionDel } from '@/util/Version'
import type { AllAppModule } from '@/core/type'
import installedVersions from '@/util/InstalledVersions'
import { brewInfo, fetchVerion, portInfo } from '@/util/Brew'
import { chmod } from '@shared/file'
import { VersionManagerStore } from '@/components/VersionManager/store'
import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'
import { AsyncComponentShow } from '@/util/AsyncComponent'

const { shell } = require('@electron/remote')
const { join, dirname } = require('path')
const { existsSync, unlinkSync, copyFileSync, readFileSync, writeFileSync } = require('fs')

export const SetupAll = (typeFlag: AllAppModule) => {
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
  const currentModule = computed(() => {
    return brewStore.module(typeFlag)
  })

  const toNext = () => {
    showNextBtn.value = false
    BrewStore().cardHeadTitle = I18nT('base.currentVersionLib')
  }

  const checkBrew = () => {
    return !!global.Server.BrewCellar
  }
  const checkPort = () => {
    return !!global.Server.MacPorts
  }

  const handleOnlineVersion = (row: any) => {
    console.log('row: ', row)
    if (!row.installed) {
      if (row.downing) {
        return
      }
      row.downing = true
      row.type = typeFlag
      IPC.send(`app-fork:${typeFlag}`, 'installSoft', JSON.parse(JSON.stringify(row))).then(
        (key: string, res: any) => {
          const all = Object.values(brewStore.module(typeFlag).list.static ?? {})
          const find = all.find((r) => r.bin === row.bin && r.zip === row.zip)
          console.log('res: ', res)
          if (res?.code === 200) {
            find && Object.assign(find, res.msg)
          } else if (res?.code === 0) {
            IPC.off(key)
            if (res?.data) {
              fetchInstalled().then()
              fetchOnline().then()
            }
            find && (find.downing = false)
          }
        }
      )
    } else {
      staticVersionDel(row.appDir)
    }
  }

  const handleBrewPortVersion = (row: any) => {
    if (brewRunning?.value) {
      return
    }
    brewStore.log.splice(0)
    brewStore.showInstallLog = true
    brewStore.brewRunning = true
    let fn = ''
    if (row.installed) {
      fn = 'uninstall'
      brewStore.cardHeadTitle = `${I18nT('base.uninstall')} ${row.name}`
    } else {
      fn = 'install'
      brewStore.cardHeadTitle = `${I18nT('base.install')} ${row.name}`
    }

    const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'
    const name = row.name
    let params = []
    if (row.flag === 'brew') {
      const sh = join(global.Server.Static!, 'sh/brew-cmd.sh')
      const copyfile = join(global.Server.Cache!, 'brew-cmd.sh')
      if (existsSync(copyfile)) {
        unlinkSync(copyfile)
      }
      copyFileSync(sh, copyfile)
      chmod(copyfile, '0777')
      params = [`${copyfile} ${arch} ${fn} ${name}; exit 0`]
      if (proxyStr?.value) {
        params.unshift(proxyStr?.value)
      }
    } else {
      const names = [name]
      const sh = join(global.Server.Static!, 'sh/port-cmd.sh')
      const copyfile = join(global.Server.Cache!, 'port-cmd.sh')
      if (existsSync(copyfile)) {
        unlinkSync(copyfile)
      }
      if (fn === 'uninstall') {
        fn = 'uninstall --follow-dependents'
      }
      let content = readFileSync(sh, 'utf-8')
      content = content
        .replace(new RegExp('##PASSWORD##', 'g'), global.Server.Password!)
        .replace(new RegExp('##ARCH##', 'g'), arch)
        .replace(new RegExp('##ACTION##', 'g'), fn)
        .replace(new RegExp('##NAME##', 'g'), names.join(' '))
      writeFileSync(copyfile, content)
      chmod(copyfile, '0777')
      params = [`sudo -S ${copyfile}; exit 0`]
      params.push(global.Server.Password!)
      if (proxyStr?.value) {
        params.unshift(proxyStr?.value)
      }
    }

    XTerm.send(params, true).then((key: string) => {
      IPC.off(key)
      showNextBtn.value = true
      fetchInstalled().then()
      if (row.flag === 'brew') {
        fetchBrew().then()
      } else {
        fetchPort().then()
      }
    })
  }

  const tableTab = computed({
    get() {
      return VersionManagerStore.uniServicePanelTab?.[typeFlag] ?? 'local'
    },
    set(v: 'local' | 'lib') {
      VersionManagerStore.uniServicePanelTab[typeFlag] = v
    }
  })

  const tableData = computed(() => {
    const localList = brewStore.module(typeFlag).installed
    if (tableTab.value === 'local') {
      return [...localList]
    }
    const onLineList = Object.values(currentModule?.value?.list?.static ?? {}).map((item) => {
      const obj: any = {
        ...item
      }
      obj.source = I18nT('base.staticBinarie')
      return obj
    })
    const brewList = Object.values(currentModule?.value?.list?.brew ?? {}).map((item) => {
      const obj: any = {
        ...item
      }
      obj.source = 'Homebrew'
      return obj
    })
    const portList = Object.values(currentModule?.value?.list?.port ?? {}).map((item) => {
      const obj: any = {
        ...item
      }
      obj.source = 'MacPorts'
      return obj
    })
    return [...onLineList, ...brewList, ...portList]
  })

  const fetchInstalled = () => {
    const data = brewStore.module(typeFlag)
    data.installedInited = false
    return installedVersions.allInstalledVersions([typeFlag])
  }

  const fetchOnline = () => {
    return new Promise((resolve) => {
      fetchVerion(typeFlag)
        .then((online) => {
          const list = brewStore.module(typeFlag).list.static!
          for (const k in list) {
            delete list?.[k]
          }
          for (const name in online) {
            list[name] = reactive(online[name])
          }
        })
        .finally(() => {
          resolve(true)
        })
    })
  }

  const fetchBrew = () => {
    return new Promise((resolve) => {
      if (!checkBrew()) {
        resolve(true)
        return
      }
      brewInfo(typeFlag)
        .then((online) => {
          const list = brewStore.module(typeFlag).list.brew!
          for (const k in list) {
            delete list?.[k]
          }
          for (const name in online) {
            list[name] = reactive(online[name])
          }
        })
        .finally(() => {
          resolve(true)
        })
    })
  }

  const fetchPort = () => {
    return new Promise((resolve) => {
      if (!checkPort()) {
        resolve(true)
        return
      }
      portInfo(typeFlag)
        .then((online) => {
          const list = brewStore.module(typeFlag).list.port!
          for (const k in list) {
            delete list?.[k]
          }
          for (const name in online) {
            list[name] = reactive(online[name])
          }
        })
        .finally(() => {
          resolve(true)
        })
    })
  }

  const fetching = computed(() => {
    return VersionManagerStore?.fetching?.[typeFlag] ?? false
  })

  const fetchDataAll = () => {
    if (VersionManagerStore?.fetching?.[typeFlag]) {
      return
    }
    VersionManagerStore.fetching[typeFlag] = true
    const all: any = [fetchInstalled(), fetchOnline(), fetchBrew(), fetchPort()]
    Promise.all(all).then(() => {
      VersionManagerStore.fetching[typeFlag] = false
    })
  }

  const getData = () => {
    const list = tableData?.value ?? []
    if (Object.keys(list).length === 0) {
      fetchDataAll()
    }
  }

  const reGetData = () => {
    if (fetching?.value) {
      return
    }
    const dict: any = currentModule.value.list
    for (const key in dict) {
      const list = dict[key]
      for (const k in list) {
        delete list[k]
      }
    }
    brewStore.module(typeFlag).installed.splice(0)
    getData()
  }

  const openURL = (url: string) => {
    shell.openExternal(url)
  }

  const checkEnvPath = (item: SoftInstalled) => {
    if (!item.bin) {
      return false
    }
    return ServiceActionStore.allPath.includes(dirname(item.bin))
  }

  const openDir = (dir: string) => {
    shell.openPath(dir)
  }

  const handleEdit = (row: any) => {
    if (['Homebrew', 'MacPorts'].includes(row.source)) {
      handleBrewPortVersion(row)
    } else {
      handleOnlineVersion(row)
    }
  }

  let CustomPathVM: any
  import('@/components/ServiceManager/customPath.vue').then((res) => {
    CustomPathVM = res.default
  })
  const showCustomDir = () => {
    AsyncComponentShow(CustomPathVM, {
      flag: typeFlag
    }).then((res) => {
      if (res) {
        console.log('showCustomDir chagned !!!')
        VersionManagerStore.fetching[typeFlag] = true
        fetchInstalled().then(() => {
          VersionManagerStore.fetching[typeFlag] = false
        })
      }
    })
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

  getData()
  if (!brewRunning?.value) {
    brewStore.cardHeadTitle = I18nT('base.currentVersionLib')
  }

  onUnmounted(() => {
    xterm && xterm.destory()
    xterm = null
  })

  return {
    showNextBtn,
    cardHeadTitle,
    toNext,
    handleOnlineVersion,
    handleBrewPortVersion,
    tableData,
    brewRunning,
    checkBrew,
    checkPort,
    currentModule,
    reGetData,
    showLog,
    openURL,
    fetching,
    checkEnvPath,
    openDir,
    handleEdit,
    logs,
    showCustomDir,
    tableTab
  }
}
