<template>
  <el-aside width="280px" class="aside">
    <div class="aside-inner">
      <ul class="top-tool mt-3 pt-2">
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
            <li @click.stop="showLog()">
              <yb-icon :svg="import('@/svg/log.svg?raw')" width="16" height="16" />
            </li>
          </template>
        </el-popover>
        <li :class="groupClass" @click="groupDo">
          <yb-icon :svg="import('@/svg/switch.svg?raw')" width="24" height="24" />
        </li>
      </ul>
      <el-scrollbar>
        <ul class="menu top-menu">
          <template v-for="(item, index) in allList" :key="index">
            <div
              :style="
                {
                  marginTop: index === 0 ? '15px' : null
                } as any
              "
              class="module-type pb-3 pl-1 text-sm mb-3 mt-5 text-zinc-600 dark:text-gray-300 border-b border-zinc-200 dark:border-zinc-700"
              >{{ item.label }}</div
            >
            <template v-for="(i, _j) in item.sub" :key="_j">
              <component :is="i.aside"></component>
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
            <span class="title">{{ I18nT('base.leftSetup') }}</span>
          </div>
        </li>
      </ul>
    </div>
  </el-aside>
</template>

<script lang="ts" setup>
  import { computed, watch } from 'vue'
  import { passwordCheck } from '@/util/Brew'
  import IPC from '@/util/IPC'
  import { AppStore } from '@/store/app'
  import { I18nT } from '@shared/lang'
  import Router from '@/router/index'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { AppModules } from '@/core/App'
  import { AppServiceModule, type AppServiceModuleItem } from '@/core/ASide'
  import { type AllAppModule, AppModuleTypeList } from '@/core/type'
  import { AsyncComponentShow } from '@/util/AsyncComponent'

  let lastTray = ''

  const appStore = AppStore()

  const currentPage = computed(() => {
    return appStore.currentPage
  })

  const allList = computed(() => {
    return AppModuleTypeList.map((m) => {
      const sub = AppModules.filter(
        (a) => appStore.config.setup.common.showItem?.[a.typeFlag] !== false
      ).filter((a) => a?.moduleType === m || (!a?.moduleType && m === 'other'))
      sub.sort((a, b) => {
        let lowerA = a.typeFlag.toLowerCase()
        let lowerB = b.typeFlag.toLowerCase()
        if (lowerA < lowerB) return -1
        if (lowerA > lowerB) return 1
        return 0
      })
      return {
        label: I18nT(`aside.${m}`),
        sub
      }
    }).filter((s) => s.sub.length > 0)
  })

  const groupIsRunning = computed(() => {
    return Object.values(AppServiceModule).some((m) => !!m?.serviceRunning)
  })

  const groupDisabled = computed(() => {
    const modules = Object.values(AppServiceModule)
    const allDisabled = modules.every((m) => !!m?.serviceDisabled)
    const running = modules.some((m) => !!m?.serviceFetching)
    return allDisabled || running || !appStore.versionInited
  })

  const groupClass = computed(() => {
    return {
      'non-draggable': true,
      'swith-power': true,
      on: groupIsRunning.value,
      disabled: groupDisabled.value
    }
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
      groupIsRunning: groupIsRunning.value
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
        console.log('trayStore changed: ', current)
        IPC.send('APP:Tray-Store-Sync', JSON.parse(current)).then((key: string) => {
          IPC.off(key)
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

  const groupDo = () => {
    if (groupDisabled.value) {
      return
    }
    passwordCheck().then(() => {
      const modules = Object.values(AppServiceModule)
      const all: Array<Promise<string | boolean>> = []
      modules.forEach((m) => {
        const arr = m?.groupDo(groupIsRunning?.value) ?? []
        all.push(...arr)
      })
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
    })
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
    if (fn === 'switchChange' && arg === 'php') {
      AppServiceModule.php?.switchChange()
      return
    }
    const fns: { [k: string]: Function } = {
      groupDo,
      switchChange
    }
    fns[fn] && fns[fn](arg)
  })

  let autoStarted = false
  watch(
    groupDisabled,
    (v) => {
      if (!v) {
        if (autoStarted) {
          return
        }
        if (appStore.config.setup?.autoStartService === true) {
          autoStarted = true
          groupDo()
        }
      }
    },
    {
      immediate: true
    }
  )
</script>
