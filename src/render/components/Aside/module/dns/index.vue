<template>
  <li
    v-if="showItem.DNS"
    class="non-draggable"
    :class="'non-draggable' + (currentPage === '/dns' ? ' active' : '')"
    @click="emit('nav', '/dns')"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon style="padding: 5px" :svg="import('@/svg/dns2.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">DNS Server</span>
    </div>

    <el-switch
      v-model="serviceRunning"
      :loading="serviceFetching"
      :disabled="serviceFetching"
      @click.stop="stopNav"
      @change="switchChange"
    >
    </el-switch>
  </li>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { dnsStart, dnsStop } from '@/util/Service'
  import { AppStore } from '@/store/app'
  import { I18nT } from '@shared/lang'
  import { DnsStore } from '@/store/dns'
  import { MessageError, MessageSuccess } from '@/util/Element'

  defineProps<{
    currentPage: string
  }>()

  const emit = defineEmits(['nav'])

  const appStore = AppStore()
  const dnsStore = DnsStore()

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem
  })

  const serviceFetching = computed(() => {
    return dnsStore.fetching
  })

  const serviceRunning = computed(() => {
    return dnsStore.running
  })

  const groupDo = (isRunning: boolean): Array<Promise<string | boolean>> => {
    const all: Array<Promise<string | boolean>> = []
    if (isRunning) {
      if (showItem?.value?.DNS && serviceRunning?.value) {
        all.push(dnsStop())
      }
    } else {
      if (showItem?.value?.DNS) {
        all.push(dnsStart())
      }
    }
    return all
  }

  const switchChange = () => {
    let fn = null
      let promise: Promise<any> | null = null
      if (serviceFetching?.value) return
      fn = serviceRunning?.value ? dnsStop : dnsStart
      promise = fn()
      promise?.then((res) => {
        if (typeof res === 'string') {
          MessageError(res)
        } else {
          MessageSuccess(I18nT('base.success'))
        }
      })
  }

  const stopNav = () => {}

  defineExpose({
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching
  })
</script>
