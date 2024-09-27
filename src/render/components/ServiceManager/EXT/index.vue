<template>
  <el-popover
    effect="dark"
    popper-class="host-list-poper"
    placement="left-start"
    :show-arrow="false"
    width="auto"
    @before-enter="onBeforEnter"
    @show="onShow"
  >
    <ul v-poper-fix class="host-list-menu">
      <li v-loading="loading" class="path-set" :class="state" @click.stop="doChange">
        <yb-icon class="current" :svg="import('@/svg/select.svg?raw')" width="17" height="17" />
        <span class="ml-15">{{ $t('base.addToPath') }}</span>
      </li>
      <template v-if="isVersionHide">
        <li v-loading="delLoading" @click.stop="doShow">
          <yb-icon :svg="import('@/svg/show.svg?raw')" width="13" height="13" />
          <span class="ml-15">{{ $t('base.noHide') }}</span>
        </li>
      </template>
      <template v-else>
        <li v-loading="delLoading" @click.stop="doHide">
          <yb-icon :svg="import('@/svg/hide.svg?raw')" width="13" height="13" />
          <span class="ml-15">{{ $t('base.hide') }}</span>
        </li>
      </template>
    </ul>
    <template #reference>
      <el-button link class="status">
        <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
      </el-button>
    </template>
  </el-popover>
</template>
<script lang="ts" setup>
  import { computed, reactive } from 'vue'
  import type { SoftInstalled } from '@/store/brew'
  import { ServiceActionStore } from './store'
  import { AppStore } from '@/store/app'

  const { dirname } = require('path')

  const props = defineProps<{
    item: SoftInstalled
    type: string
  }>()

  const store = AppStore()

  const excludeLocalVersion = computed(() => {
    return store.config.setup.excludeLocalVersion ?? []
  })

  const isVersionHide = computed(() => {
    return excludeLocalVersion?.value?.includes(props.item.bin)
  })

  const loading = computed(() => {
    return ServiceActionStore.pathSeting?.[props.item.bin] ?? false
  })

  const delLoading = computed(() => {
    return ServiceActionStore.versionDeling?.[props.item.bin] ?? false
  })

  const state = computed(() => {
    if (ServiceActionStore.allPath.length === 0) {
      return ''
    }
    if (ServiceActionStore.allPath.includes(dirname(props.item.bin))) {
      return 'seted'
    }
    return 'noset'
  })

  const onBeforEnter = () => {
    console.log('onBeforEnter !!!')
    ServiceActionStore.fetchPath()
  }

  const onShow = () => {
    console.log('onShow !!!')
  }

  const doChange = () => {
    ServiceActionStore.updatePath(props.item, props.type)
  }

  const doShow = () => {
    store.serviceShow(props.item.bin)
  }

  const doHide = () => {
    store.serviceHide(props.item.bin)
  }
</script>
