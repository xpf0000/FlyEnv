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
              <yb-icon
                style="opacity: 0.7"
                :svg="import('@/svg/question.svg?raw')"
                width="17"
                height="17"
              />
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
  import { computed } from 'vue'
  import { AppStore } from '@web/store/app'
  import { I18nT } from '@shared/lang'
  import Router from '@/router/index'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { AppModules } from '@web/core/App'
  import { AppServiceModule } from '@web/core/ASide'

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

  const toDoc = () => {}

  const groupDo = () => {
    if (groupDisabled.value) {
      return
    }
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
</script>
