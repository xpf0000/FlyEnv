import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import XTerm from '@/util/XTerm'
import { I18nT } from '@shared/lang'
import IPC from '@/util/IPC'
import type { AllAppModule } from '@/core/type'
import installedVersions from '@/util/InstalledVersions'
import { brewCheck, brewInfo } from '@/util/Brew'
import { chmod } from '@shared/file'
import { VersionManagerStore } from '@/components/VersionManager/store'

const { join } = require('path')
const { existsSync, unlinkSync, copyFileSync } = require('fs')

export const Setup = (typeFlag: AllAppModule) => {
  const appStore = AppStore()
  const brewStore = BrewStore()

  const showNextBtn = ref(false)
  const logs = ref<HTMLElement>()
  let xterm: XTerm | null = null

  const proxy = computed(() => {
    return appStore.config.setup.proxy
  })
  const brewRunning = computed(() => {
    return brewStore.brewRunning
  })
  const showInstallLog = computed(() => {
    return brewStore.showInstallLog
  })
  const proxyStr = computed(() => {
    if (!proxy?.value.on) {
      return undefined
    }
    return proxy?.value?.proxy
  })
  const showLog = computed(() => {
    return showInstallLog?.value || showNextBtn?.value
  })
  const currentModule = computed(() => {
    return brewStore.module(typeFlag)
  })

  const toNext = () => {
    showNextBtn.value = false
  }

  const checkBrew = () => {
    return !!global.Server.BrewCellar
  }

  const fetching = computed(() => {
    return VersionManagerStore.sourceFetching(typeFlag)['brew']
  })

  const fetchData = (src: 'brew') => {
    if (VersionManagerStore.sourceFetching(typeFlag)?.[src]) {
      return
    }
    VersionManagerStore.sourceFetching(typeFlag)[src] = true
    const currentItem = brewStore.module(typeFlag)
    const list = currentItem.list?.[src] ?? {}
    brewInfo(typeFlag)
      .then((res: any) => {
        for (const k in list) {
          delete list?.[k]
        }
        for (const name in res) {
          list[name] = reactive(res[name])
        }
        VersionManagerStore.sourceFetching(typeFlag)[src] = false
      })
      .catch(() => {
        VersionManagerStore.sourceFetching(typeFlag)[src] = false
      })
  }
  const getData = () => {
    const currentItem = brewStore.module(typeFlag)
    const src = 'brew'
    if (!src || VersionManagerStore.sourceFetching(typeFlag)[src]) {
      return
    }
    const list = currentItem.list?.[src]
    if (list && Object.keys(list).length === 0) {
      brewCheck()
        .then(() => {
          if (typeFlag === 'php') {
            if (src === 'brew' && !appStore?.config?.setup?.phpBrewInited) {
              /**
               * 先获取已安装的 php, 同时安装shivammathur/php库, 安装成功后, 再刷新数据
               * 避免国内用户添加库非常慢, 导致已安装数据也无法获取
               */
              IPC.send('app-fork:brew', 'addTap', 'shivammathur/php').then(
                (key: string, res: any) => {
                  IPC.off(key)
                  appStore.config.setup.phpBrewInited = true
                  appStore.saveConfig()
                  if (res?.data === 2) {
                    fetchData('brew')
                  }
                }
              )
            }
          } else if (typeFlag === 'mongodb' && !appStore?.config?.setup?.mongodbBrewInited) {
            if (src === 'brew') {
              IPC.send('app-fork:brew', 'addTap', 'mongodb/brew').then((key: string, res: any) => {
                IPC.off(key)
                appStore.config.setup.mongodbBrewInited = true
                appStore.saveConfig()
                if (res?.data === 2) {
                  fetchData('brew')
                }
              })
            }
          }
        })
        .catch()
      fetchData(src)
    }
  }

  const reGetData = () => {
    const list = brewStore.module(typeFlag).list?.['brew']
    for (const k in list) {
      delete list[k]
    }
    getData()
  }

  const regetInstalled = () => {
    reGetData()
    brewStore.showInstallLog = false
    brewStore.brewRunning = false
    brewStore.module(typeFlag).installedInited = false
    installedVersions.allInstalledVersions([typeFlag]).then()
  }

  const handleBrewVersion = (row: any) => {
    if (brewRunning?.value) {
      return
    }
    brewStore.log.splice(0)
    brewStore.showInstallLog = true
    brewStore.brewRunning = true
    let fn = ''
    if (row.installed) {
      fn = 'uninstall'
    } else {
      fn = 'install'
    }

    const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'
    const name = row.name
    let params = []
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
    XTerm.send(params, true).then((key: string) => {
      IPC.off(key)
      showNextBtn.value = true
      regetInstalled()
    })
  }

  const tableData = computed(() => {
    const arr = []
    const list = brewStore.module(typeFlag).list?.['brew']
    for (const name in list) {
      const value = list[name]
      const nums = value.version.split('.').map((n: string, i: number) => {
        if (i > 0) {
          const num = parseInt(n)
          if (isNaN(num)) {
            return '00'
          }
          if (num < 10) {
            return `0${num}`
          }
          return num
        }
        return n
      })
      const num = parseInt(nums.join(''))
      Object.assign(value, {
        name,
        version: value.version,
        installed: value.installed,
        num,
        flag: value.flag
      })
      arr.push(value)
    }
    arr.sort((a, b) => {
      return b.num - a.num
    })
    return arr
  })

  watch(
    showLog,
    (val) => {
      nextTick().then(() => {
        if (val) {
          const dom = logs.value!
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
    toNext,
    handleBrewVersion,
    tableData,
    brewRunning,
    checkBrew,
    currentModule,
    reGetData,
    showLog,
    fetching,
    logs
  }
}
