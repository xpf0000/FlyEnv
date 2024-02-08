<template>
  <li
    v-if="showItem.HttpServe"
    :class="'non-draggable' + (currentPage === '/httpServe' ? ' active' : '')"
    @click="emit('nav', '/httpServe')"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon
          style="padding: 4.5px"
          :svg="import('@/svg/http.svg?raw')"
          width="28"
          height="28"
        />
      </div>
      <span class="title">Http Serve</span>
    </div>
  </li>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@web/store/app'

  defineProps<{
    currentPage: string
  }>()

  const emit = defineEmits(['nav'])

  const appStore = AppStore()

  const serviceRunning = computed(() => {
    return Object.values(appStore.httpServeService).some((a) => a.run)
  })

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem
  })
</script>
