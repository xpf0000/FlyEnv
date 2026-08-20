<template>
  <li v-if="isWindows" @click.stop="showFastCgiWorkers">
    <yb-icon :svg="import('@/svg/config.svg?raw')" width="17" height="17" />
    <span class="ml-3">{{ I18nT('php.fastcgiWorkers') }} ({{ fastCgiWorkerCount }})</span>
  </li>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import { I18nT } from '@lang/index'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import IPC from '@/util/IPC'

  const props = defineProps<{
    item: ModuleInstalledItem
  }>()

  const isWindows = computed(() => window.Server.isWindows)
  const fastCgiWorkerCount = ref(4)
  const fastCgiWorkersOpening = ref(false)

  const fetchFastCgiWorkerCount = () => {
    if (!isWindows.value) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      IPC.send(
        'app-fork:php',
        'getFastCgiWorkerCount',
        JSON.parse(JSON.stringify(props.item))
      ).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0 && Number.isInteger(res?.data)) {
          fastCgiWorkerCount.value = res.data
        }
        resolve()
      })
    })
  }

  const showFastCgiWorkers = async () => {
    if (fastCgiWorkersOpening.value) {
      return
    }
    fastCgiWorkersOpening.value = true
    try {
      await fetchFastCgiWorkerCount()
      const FastCgiWorkersVM = (await import('./FastCgiWorkers.vue')).default
      AsyncComponentShow(FastCgiWorkersVM, {
        version: props.item,
        workerCount: fastCgiWorkerCount.value
      }).then((count) => {
        if (Number.isInteger(count)) {
          fastCgiWorkerCount.value = count as number
        }
      })
    } finally {
      fastCgiWorkersOpening.value = false
    }
  }

  onMounted(() => {
    fetchFastCgiWorkerCount()
  })
</script>
