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
        <span class="ml-15">{{ I18nT('base.addToPath') }}</span>
      </li>
      <template v-if="type === 'postgresql'">
        <Extension :item="item" />
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
  import { computed } from 'vue'
  import type { SoftInstalled } from '@/store/brew'
  import { ServiceActionStore } from './store'
  import Extension from '@/components/ServiceManager/Pgsql/extension.vue'
  import { I18nT } from '@shared/lang'

  const { dirname, join } = require('path')

  const props = defineProps<{
    item: SoftInstalled
    type: string
  }>()

  const loading = computed(() => {
    return ServiceActionStore.pathSeting?.[props.item.bin] ?? false
  })

  const state = computed(() => {
    if (ServiceActionStore.allPath.length === 0) {
      return ''
    }
    let bin = dirname(props.item.bin)
    if (props.type === 'php') {
      bin = dirname(props.item?.phpBin ?? join(props.item.path, 'bin/php'))
    }
    console.log('bin: ', bin)
    if (ServiceActionStore.allPath.includes(bin)) {
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
</script>
