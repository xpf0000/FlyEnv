<template>
  <el-aside width="280px" class="aside">
    <div class="aside-inner">
      <ul class="top-tool">
        <el-popover :show-after="800">
          <template #default>
            <span>{{ I18nT('base.about') }}</span>
          </template>
          <template #reference>
            <li @click="toDoc">
              <yb-icon style="opacity: 0.7" :svg="import('@/svg/question.svg?raw')" width="17" height="17" />
            </li>
          </template>
        </el-popover>
        <li :class="groupClass" @click="groupDo">
          <yb-icon :svg="import('@/svg/switch.svg?raw')" width="24" height="24" />
        </li>
      </ul>
      <el-scrollbar>
        <ul class="menu top-menu">
          <template v-for="(item, index) in AppModules" :key="index">
            <component :is="item.aside"></component>
          </template>
        </ul>
      </el-scrollbar>
      <ul class="menu setup-menu">
        <li :class="'non-draggable' + (currentPage === '/setup' ? ' active' : '')" @click="nav('/setup')">
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
import Base from '@/core/Base'
import { AppModules } from '@/core/App'
import { AppServiceModule, type AppServiceModuleItem } from '@/core/ASide'
import type { AllAppModule } from '@/core/type'

let lastTray = ''

const appStore = AppStore()

const currentPage = computed(() => {
  return appStore.currentPage
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

const toDoc = () => {
  Base.Dialog(import('@/components/About/index.vue'))
    .className('about-dialog')
    .title(I18nT('base.about'))
    .width('665px')
    .noFooter()
    .show()
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
</script>