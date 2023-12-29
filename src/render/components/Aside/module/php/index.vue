<template>
  <li
    v-if="showItem.Php"
    :class="'non-draggable' + (currentPage === '/php' ? ' active' : '')"
    @click="emit('nav', '/php')"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon :svg="import('@/svg/php.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">Php</span>
    </div>

    <el-switch v-model="serviceRunning" :disabled="serviceDisabled"> </el-switch>
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

  defineProps<{
    currentPage: string
  }>()

  const emit = defineEmits(['nav'])

  const appStore = AppStore()
  const brewStore = BrewStore()

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem
  })

  const phpVersions = computed(() => {
    return brewStore?.php?.installed ?? []
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
      if (showItem?.value?.Php) {
        phpVersions?.value?.forEach((v) => {
          if (v?.version && v?.run) {
            all.push(stopService('php', v))
          }
        })
      }
    } else {
      if (showItem?.value?.Php) {
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

  defineExpose({
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled
  })
</script>
