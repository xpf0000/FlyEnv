<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/php' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon :svg="import('@/svg/php.svg?raw')" style="padding: 4px" width="30" height="30" />
      </div>
      <span class="title">PHP</span>
    </div>

    <el-switch v-model="serviceRunning" :disabled="serviceDisabled" @click.stop="stopNav">
    </el-switch>
  </li>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { startService, stopService } from '@/util/Service'
  import { passwordCheck } from '@/util/Brew'
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import { I18nT } from '@shared/lang'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { AppServiceModule, AsideSetup } from '@/core/ASide'

  const { showItem, currentPage, nav, stopNav } = AsideSetup('php')

  const appStore = AppStore()
  const brewStore = BrewStore()

  const phpVersions = computed(() => {
    return brewStore.module('php').installed
  })

  const serviceRunning = computed({
    get(): boolean {
      return phpVersions?.value?.length > 0 && phpVersions?.value?.some((v) => v.run)
    },
    set(v: boolean) {
      passwordCheck().then(() => {
        const all: Array<Promise<any>> = []
        if (v) {
          phpVersions?.value?.forEach((v) => {
            if (v?.version && appStore.phpGroupStart?.[v.bin] !== false && !v?.run) {
              all.push(startService('php', v))
            }
          })
        } else {
          phpVersions?.value?.forEach((v) => {
            if (v?.version && v?.run) {
              all.push(stopService('php', v))
            }
          })
        }
        Promise.all(all).then((res) => {
          let find = res.find((s) => typeof s === 'string')
          if (find) {
            MessageError(find)
          } else {
            MessageSuccess(I18nT('base.success'))
          }
        })
      })
    }
  })

  const serviceDisabled = computed(() => {
    return (
      phpVersions?.value?.length === 0 ||
      phpVersions?.value?.some((v) => v.running) ||
      !appStore.versionInited
    )
  })

  const serviceFetching = computed(() => {
    return phpVersions?.value?.some((v) => v.running)
  })

  const groupDo = (isRunning: boolean): Array<Promise<string | boolean>> => {
    const all: Array<Promise<string | boolean>> = []
    if (isRunning) {
      if (showItem?.value) {
        phpVersions?.value?.forEach((v) => {
          if (v?.version && v?.run) {
            all.push(stopService('php', v))
          }
        })
      }
    } else {
      if (showItem?.value) {
        phpVersions?.value?.forEach((v) => {
          if (v?.version && appStore.phpGroupStart?.[v.bin] !== false && !v?.run) {
            all.push(startService('php', v))
          }
        })
      }
    }
    return all
  }

  const switchChange = () => {
    serviceRunning.value = !serviceRunning.value
  }

  AppServiceModule.php = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
