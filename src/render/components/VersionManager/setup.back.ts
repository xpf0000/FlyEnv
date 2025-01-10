import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import XTerm from '@/util/XTerm'
import { I18nT } from '@shared/lang'
import IPC from '@/util/IPC'
import { staticVersionDel } from '@/util/Version'
import type { AllAppModule } from '@/core/type'
import installedVersions from '@/util/InstalledVersions'
import { brewCheck, brewInfo, fetchVerion, portInfo } from '@/util/Brew'
import { chmod } from '@shared/file'
import { VersionManagerStore } from '@/components/VersionManager/store'

const { join } = require('path')
const { existsSync, unlinkSync, copyFileSync, readFileSync, writeFileSync } = require('fs')

export const Setup = (typeFlag: AllAppModule, hasStatic?: boolean) => {
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

  const fetching = computed(() => {
    if (!libSrc.value) {
      return false
    }
    return VersionManagerStore.sourceFetching(typeFlag)[libSrc.value]
  })

  const libSrc = computed({
    get(): 'brew' | 'port' | 'static' | undefined {
      return (
        brewStore.LibUse[typeFlag] ??
        (checkBrew() ? 'brew' : checkPort() ? 'port' : hasStatic === true ? 'static' : undefined)
      )
    },
    set(v: 'brew' | 'port' | 'static') {
      brewStore.LibUse[typeFlag] = v
    }
  })
  const fetchData = (src: 'brew' | 'port' | 'static') => {
    if (VersionManagerStore.sourceFetching(typeFlag)?.[src]) {
      return
    }
    VersionManagerStore.sourceFetching(typeFlag)[src] = true
    const currentItem = brewStore.module(typeFlag)
    const list = currentItem.list?.[src] ?? {}
    let getInfo: Promise<any>
    if (src === 'brew') {
      getInfo = brewInfo(typeFlag)
    } else if (src === 'port') {
      getInfo = portInfo(typeFlag)
    } else {
      getInfo = fetchVerion(typeFlag)
    }

    getInfo
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
    const src = libSrc.value
    if (!src || VersionManagerStore.sourceFetching(typeFlag)[src]) {
      return
    }
    const list = currentItem.list?.[src]
    if (list && Object.keys(list).length === 0) {
      if (src === 'brew') {
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
                IPC.send('app-fork:brew', 'addTap', 'mongodb/brew').then(
                  (key: string, res: any) => {
                    IPC.off(key)
                    appStore.config.setup.mongodbBrewInited = true
                    appStore.saveConfig()
                    if (res?.data === 2) {
                      fetchData('brew')
                    }
                  }
                )
              }
            }
          })
          .catch()
      }
      fetchData(src)
    }
  }

  const reGetData = () => {
    if (!libSrc?.value) {
      return
    }
    const list = brewStore.module(typeFlag).list?.[libSrc.value]
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

  const handleOnlineVersion = (row: any, installed: boolean) => {
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
          const all = Object.values(brewStore.module(typeFlag).list.static ?? {})
          const find = all.find((r) => r.bin === row.bin && r.zip === row.zip)
          if (res?.code === 200) {
            find && Object.assign(find, res.msg)
          } else if (res?.code === 0) {
            IPC.off(key)
            if (res?.data) {
              regetInstalled()
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
      if (typeFlag === 'php') {
        names.push(`${name}-fpm`, `${name}-mysql`, `${name}-apache2handler`, `${name}-iconv`)
      } else if (typeFlag === 'mysql') {
        names.push(`${name}-server`)
      } else if (typeFlag === 'mariadb') {
        names.push(`${name}-server`)
      } else if (typeFlag === 'python') {
        names.push(`${name.replace('python', 'py')}-pip`)
      }
      if (['php52', 'php53', 'php54', 'php55', 'php56'].includes(name) && fn === 'install') {
        const sh = join(global.Server.Static!, 'sh/port-cmd-user.sh')
        const copyfile = join(global.Server.Cache!, 'port-cmd-user.sh')
        if (existsSync(copyfile)) {
          unlinkSync(copyfile)
        }
        const libs = names.join(' ')
        const arrs = [
          `echo "arch ${arch} sudo port clean -v ${libs}"`,
          `arch ${arch} sudo -S port clean -v ${libs}`
        ]
        names.forEach((name) => {
          arrs.push(
            `echo "arch ${arch} sudo port install -v ${name} configure.compiler=macports-clang-10"`
          )
          arrs.push(
            `arch ${arch} sudo -S port install -v ${name} configure.compiler=macports-clang-10`
          )
        })
        let content = readFileSync(sh, 'utf-8')
        content = content.replace('##CONTENT##', arrs.join('\n'))
        writeFileSync(copyfile, content)
        chmod(copyfile, '0777')
        params = [`sudo -S ${copyfile}; exit 0`]
        params.push(global.Server.Password!)
      } else {
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
      }
      if (proxyStr?.value) {
        params.unshift(proxyStr?.value)
      }
    }

    XTerm.send(params, true).then((key: string) => {
      IPC.off(key)
      showNextBtn.value = true
      regetInstalled()
    })
  }

  const tableData = computed(() => {
    if (!libSrc?.value) {
      return []
    }
    const arr = []
    const list = brewStore.module(typeFlag).list?.[libSrc.value]
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

  watch(libSrc, (v) => {
    if (v) {
      if (VersionManagerStore.sourceFetching(typeFlag)[v]) {
        return
      }
      const list = brewStore.module(typeFlag).list?.[v] ?? {}
      if (list && Object.keys(list).length === 0) {
        reGetData()
      }
    }
  })

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
    libSrc,
    checkBrew,
    checkPort,
    currentModule,
    reGetData,
    showLog,
    fetching,
    logs
  }
}
