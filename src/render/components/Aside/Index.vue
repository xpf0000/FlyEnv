<template>
  <el-aside width="280px" class="aside">
    <div class="aside-inner">
      <ul class="top-tool mt-3 pt-2" :style="topToolStyle as any">
        <el-popover
          width="auto"
          :show-after="800"
          placement="right"
          popper-class="app-popover-min-w-auto"
        >
          <template #default>
            <span>{{ I18nT('aside.appExit') }}</span>
          </template>
          <template #reference>
            <li class="cursor-pointer" @click.stop="appExit()">
              <yb-icon
                class="fa-flip-h"
                :svg="import('@/svg/exit.svg?raw')"
                width="16"
                height="16"
              />
            </li>
          </template>
        </el-popover>
        <el-popover
          width="auto"
          :show-after="800"
          placement="right"
          popper-class="app-popover-min-w-auto"
        >
          <template #default>
            <span>{{ I18nT('aside.appLog') }}</span>
          </template>
          <template #reference>
            <li class="cursor-pointer" @click.stop="showLog()">
              <yb-icon :svg="import('@/svg/log.svg?raw')" width="16" height="16" />
            </li>
          </template>
        </el-popover>
        <el-popover
          width="auto"
          :show-after="800"
          placement="right"
          popper-class="app-popover-min-w-auto"
        >
          <template #default>
            <span>{{ I18nT('aside.groupStart') }}</span>
          </template>
          <template #reference>
            <li :class="groupClass" @click="groupDo">
              <yb-icon :svg="import('@/svg/switch.svg?raw')" width="24" height="24" />
            </li>
          </template>
        </el-popover>
      </ul>
      <el-scrollbar>
        <ul class="menu top-menu">
          <template v-for="(item, _index) in allModule" :key="_index">
            <div
              :style="
                {
                  marginTop: _index === 0 ? '15px' : null
                } as any
              "
              class="module-type pb-3 pl-1 text-sm mb-3 mt-5 text-zinc-600 dark:text-gray-300 border-b border-zinc-200 dark:border-zinc-700"
              >{{ item.label }}</div
            >
            <template v-for="(i, _j) in item.sub" :key="_j">
              <template v-if="i?.isCustomer">
                <CustomerModule :item="i as any" />
              </template>
              <template v-else>
                <component :is="i.aside"></component>
              </template>
            </template>
          </template>
        </ul>
      </el-scrollbar>
      <ul class="menu setup-menu">
        <li
          :class="'non-draggable' + (currentPage === '/setup' ? ' active' : '')"
          @click="nav('/setup')"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon :svg="import('@/svg/setup.svg?raw')" width="30" height="30" />
            </div>
            <span class="title">{{ I18nT('base.settings') }}</span>
          </div>
        </li>
      </ul>
    </div>
  </el-aside>
</template>

<script lang="ts" setup>
  import { computed, watch } from 'vue'
  import IPC from '@/util/IPC'
  import { AppStore } from '@/store/app'
  import { I18nT } from '@lang/index'
  import Router from '@/router/index'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { AppModules } from '@/core/App'
  import { AppServiceModule, type AppServiceModuleItem } from '@/core/ASide'
  import { type AllAppModule, AppModuleTypeList } from '@/core/type'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { AppCustomerModule } from '@/core/Module'
  import CustomerModule from '@/components/CustomerModule/aside.vue'
  import type { CallbackFn } from '@shared/app'
  import { BrewStore } from '@/store/brew'
  import { ElMessageBox } from 'element-plus'

  let lastTray = ''

  const appStore = AppStore()
  const brewStore = BrewStore()

  appStore.chechAutoHide()

  const currentPage = computed(() => {
    return appStore.currentPage
  })

  const topToolStyle = computed(() => {
    if (window.Server.isMacOS) {
      return null
    }
    return {
      paddingTop: '11px'
    }
  })

  const platformAppModules = computed(() => {
    let platform: any = ''
    if (window.Server.isMacOS) {
      platform = 'macOS'
    } else if (window.Server.isWindows) {
      platform = 'Windows'
    } else if (window.Server.isLinux) {
      platform = 'Linux'
    }
    if (!platform) {
      return []
    }
    return AppModules.filter((a) => !a.platform || a.platform.includes(platform))
  })

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem
  })

  const firstItem = computed(() => {
    const m = 'site'
    const sub = platformAppModules.value
      .filter((a) => a?.moduleType === m)
      .filter((a) => showItem.value?.[a.typeFlag] !== false)
    sub.sort((a, b) => {
      const lowerA = a.typeFlag.toLowerCase()
      const lowerB = b.typeFlag.toLowerCase()
      if (lowerA < lowerB) return -1
      if (lowerA > lowerB) return 1
      return 0
    })
    const customer: any = AppCustomerModule.module
      .filter((f) => f.moduleType === m)
      .filter((a) => showItem.value?.[a.typeFlag] !== false)
    console.log('customer: ', customer, m)
    sub.unshift(...customer)
    return sub.length
      ? {
          label: I18nT(`aside.site`),
          sub
        }
      : undefined
  })

  const allList = computed(() => {
    return AppModuleTypeList.filter((f) => f !== 'site')
      .map((m) => {
        const sub = platformAppModules.value
          .filter((a) => showItem.value?.[a.typeFlag] !== false)
          .filter((a) => a?.moduleType === m || (!a?.moduleType && m === 'other'))
        sub.sort((a, b) => {
          const lowerA = a.typeFlag.toLowerCase()
          const lowerB = b.typeFlag.toLowerCase()
          if (lowerA < lowerB) return -1
          if (lowerA > lowerB) return 1
          return 0
        })
        const customer: any = AppCustomerModule.module
          .filter((f) => f.moduleType === m)
          .filter((a) => showItem.value?.[a.typeFlag] !== false)
        sub.unshift(...customer)
        return {
          label: I18nT(`aside.${m}`),
          sub
        }
      })
      .filter((s) => s.sub.length > 0)
  })

  const customerList = computed(() => {
    return AppCustomerModule.moduleCate
      .map((m) => {
        const sub = AppCustomerModule.module
          .filter((s) => {
            return s.moduleType === m.moduleType
          })
          .filter((a) => showItem.value?.[a.typeFlag] !== false)
        return {
          ...m,
          sub
        }
      })
      .filter((s) => s.sub.length > 0)
  })

  const allModule = computed(() => {
    return [firstItem.value, ...customerList.value, ...allList.value].filter((f) => !!f)
  })

  const isRouteCurrent = computed(() => {
    const current = appStore.currentPage
    if (current === '/setup') {
      return true
    }
    const find = allModule.value
      .map((m) => m.sub)
      .flat()
      .some((m) => `/${m.typeFlag}` === current)
    console.log('isRouteCurrent: ', current, find)
    return find
  })

  const routeWatchObj = computed(() => {
    return {
      current: isRouteCurrent.value,
      module: allModule.value.length
    }
  })

  watch(
    routeWatchObj,
    (v) => {
      console.log('isRouteCurrent watch: ', v)
      if (!v.current && v.module > 0) {
        const item = allModule.value[0]
        if (item) {
          const sub: any = item?.sub?.[0]
          if (!sub) {
            return
          }
          console.log('sub: ', sub)
          if (sub?.isCustomer) {
            const path = `/${sub.typeFlag}`
            AppCustomerModule.currentModule = AppCustomerModule.module.find(
              (f) => f.id === sub.typeFlag
            )
            Router.push({
              path: '/customer-module'
            })
              .then()
              .catch()
            appStore.currentPage = path
          } else {
            const path = `/${sub.typeFlag}`
            Router.push({
              path
            })
              .then()
              .catch()
            appStore.currentPage = path
          }
        }
      }
    },
    {
      immediate: true
    }
  )

  const allShowTypeFlag = computed(() => {
    return platformAppModules.value
      .filter((f) => f.isService && showItem.value?.[f.typeFlag] !== false)
      .map((f) => f.typeFlag)
  })

  /**
   * Aside service vue component
   */
  const asideServiceShowModule = computed(() => {
    return allShowTypeFlag.value.map((f) => AppServiceModule?.[f]).filter((f) => !!f)
  })

  const serviceShowSystem = computed(() => {
    return platformAppModules.value
      .filter((f) => f.isService && showItem.value?.[f.typeFlag] !== false)
      .map((f) => brewStore.module(f.typeFlag).installed)
      .flat()
  })

  const serviceShowCustomer = computed(() => {
    return AppCustomerModule.module
      .filter((f) => f.isService && showItem.value?.[f.typeFlag] !== false)
      .map((f) => f.item)
      .flat()
  })

  /**
   * All Aside service is set not group start. And no customer service exists
   */
  const noGroupStart = computed(() => {
    const a = allShowTypeFlag.value.every((typeFlag) => {
      const v = brewStore.currentVersion(typeFlag)
      if (!v) {
        return true
      }
      return appStore.phpGroupStart?.[v.bin] === false
    })
    const b = serviceShowCustomer.value.length === 0
    return a && b
  })

  const groupIsRunning = computed(() => {
    return (
      asideServiceShowModule.value.some((m) => !!m?.serviceRunning) ||
      serviceShowSystem.value.some((m) => m.run) ||
      serviceShowCustomer.value.some((s) => s.run)
    )
  })

  const groupDisabled = computed(() => {
    const modules = Object.values(AppServiceModule)
    const allDisabled = modules.every((m) => !!m?.serviceDisabled)
    const running = modules.some((m) => !!m?.serviceFetching)
    console.log('groupDisabled', allDisabled, running, appStore.versionInitiated)
    return (
      allDisabled ||
      running ||
      !appStore.versionInitiated ||
      noGroupStart.value ||
      serviceShowCustomer.value.some((s) => s.running)
    )
  })

  const groupClass = computed(() => {
    return {
      'non-draggable': true,
      'swith-power': true,
      on: groupIsRunning.value,
      disabled: groupDisabled.value
    }
  })

  const customerModule = computed(() => {
    return AppCustomerModule.module
      .filter((f) => f.isService)
      .filter((a) => showItem.value?.[a.typeFlag] !== false)
      .map((m) => {
        const emptyItem = m.item.length === 0
        const running = m.item.some((s) => s.running)
        return {
          id: m.id,
          label: m.label,
          icon: m.icon,
          show: true,
          disabled: emptyItem || running,
          run: m.item.some((s) => s.run),
          running
        }
      })
  })

  const trayStore = computed(() => {
    const dict: any = {}
    let k: AllAppModule
    for (k in AppServiceModule) {
      const m: AppServiceModuleItem = AppServiceModule[k]!
      dict[k] = {
        show: m.showItem,
        disabled: m.serviceDisabled,
        run: m.serviceRunning,
        running: m.serviceFetching
      }
    }
    return {
      ...dict,
      password: appStore?.config?.password,
      lang: appStore?.config?.setup?.lang,
      theme: appStore?.config?.setup?.theme,
      groupDisabled: groupDisabled.value,
      groupIsRunning: groupIsRunning.value,
      customerModule: customerModule.value
    }
  })

  watch(groupIsRunning, (val) => {
    IPC.send('Application:tray-status-change', val).then((key: string) => {
      IPC.off(key)
    })
  })

  watch(
    trayStore,
    (v) => {
      const current = JSON.stringify(v)
      if (lastTray !== current) {
        lastTray = current
        const obj = JSON.parse(current)
        const customerModule = obj.customerModule
        for(const item of customerModule) {
          item.isCustomer = true
        }
        delete obj.customerModule
        console.log('allModule.value: ', allModule.value)
        console.log('customerModule: ', customerModule)
        const service = allModule.value
          .map((m) => m.sub)
          .flat()
          .filter((f: any) => !f.isCustomer && (f.isService || f.isTray))
          .map((m) => {
            const key = m?.typeFlag ?? m?.id ?? ''
            const item = obj[key]
            delete obj[key]
            const icon = m.icon
            return new Promise((resolve) => {
              if (typeof icon === 'string') {
                resolve({
                  ...item,
                  id: m?.id,
                  label: typeof m.label === 'function' ? m.label() : m.label,
                  typeFlag: m?.typeFlag,
                  icon
                })
              } else {
                console.log('icon: ', icon)
                icon.then((res: any) => {
                  resolve({
                    ...item,
                    id: m?.id,
                    label: typeof m.label === 'function' ? m.label() : m.label,
                    typeFlag: m?.typeFlag,
                    icon: res.default
                  })
                })
              }
            })
          })

        Promise.all(service).then((res) => {
          const list = [...customerModule, ...res]
          console.log('list: ', list)
          obj.service = list
          IPC.send('APP:Tray-Store-Sync', obj).then((key: string) => {
            IPC.off(key)
          })
        })
      }
    },
    {
      immediate: true,
      deep: true
    }
  )

  let LogVM: any
  import('@/components/AppLog/log.vue').then((res) => {
    LogVM = res.default
  })
  const showLog = () => {
    AsyncComponentShow(LogVM).then()
  }

  const appExit = () => {
    ElMessageBox.confirm(I18nT('aside.appExit') + '?', I18nT('host.warning'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      type: 'warning'
    })
      .then(() => {
        IPC.send('application:exit').then((key: string) => {
          IPC.off(key)
        })
      })
      .catch()
  }

  const groupDo = () => {
    if (groupDisabled.value) {
      return
    }
    const isRun = groupIsRunning.value
    const asideModules = asideServiceShowModule.value
    const all: Array<Promise<string | boolean>> = []
    asideModules.forEach((m) => {
      const arr = m?.groupDo(isRun) ?? []
      all.push(...arr)
    })
    const customerModule = AppCustomerModule.module
      .filter((a) => a.isService && showItem.value?.[a.typeFlag] !== false)
      .map((m) => {
        return isRun ? m.stop() : m.start()
      })
    all.push(...customerModule)
    if (all.length > 0) {
      const err: Array<string> = []
      const run = () => {
        const task = all.pop()
        if (task) {
          task
            .then((s: boolean | string) => {
              if (typeof s === 'string') {
                err.push(s)
              }
              run()
            })
            .catch((e: any) => {
              err.push(e.toString())
              run()
            })
        } else {
          if (err.length === 0) {
            MessageSuccess(I18nT('base.success'))
          } else {
            MessageError(err.join('<br/>'))
          }
        }
      }
      run()
    }
  }

  const switchChange = (flag: AllAppModule) => {
    AppServiceModule?.[flag]?.switchChange()
  }

  const nav = (page: string) => {
    return new Promise((resolve) => {
      if (currentPage.value === page) {
        resolve(true)
      }
      Router.push({
        path: page
      })
        .then()
        .catch()
      appStore.currentPage = page
    })
  }

  IPC.on('APP:Tray-Command').then((key: string, fn: string, arg: any) => {
    console.log('on APP:Tray-Command', key, fn, arg)
    const find = AppCustomerModule.module.find((m) => m.id === arg)
    if (find) {
      const run = find.item.some((s) => s.run)
      if (run) {
        find.stop()
      } else {
        find.start()
      }
      return
    }
    if (fn === 'switchChange' && arg === 'php') {
      AppServiceModule.php?.switchChange()
      return
    }
    const fns: { [k: string]: CallbackFn } = {
      groupDo,
      switchChange
    }
    fns?.[fn]?.(arg)
  })

  let autoStarted = false

  const doAutoStart = () => {
    autoStarted = true
    if (window.Server.isWindows) {
      groupDo()
      return
    }
    IPC.send('APP:FlyEnv-Helper-Check').then((key: string, res: any) => {
      if (res?.code === 0 && res?.data) {
        groupDo()
      } else {
        setTimeout(doAutoStart, 2000)
      }
    })
  }

  const needAutoStart = computed(() => {
    return (
      appStore.config.setup?.autoStartService === true &&
      !groupDisabled.value &&
      !groupIsRunning.value
    )
  })

  watch(
    needAutoStart,
    (v) => {
      if (v && !autoStarted) {
        doAutoStart()
      }
    },
    {
      immediate: true
    }
  )
</script>
