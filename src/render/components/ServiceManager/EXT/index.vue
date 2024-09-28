<template>
  <el-popover effect="dark" popper-class="host-list-poper" placement="left-start" :show-arrow="false" width="auto"
    @before-enter="onBeforEnter" @show="onShow">
    <ul v-poper-fix class="host-list-menu">
      <li v-loading="loading" class="path-set" :class="state" @click.stop="doChange">
        <yb-icon class="current" :svg="import('@/svg/select.svg?raw')" width="17" height="17" />
        <span class="ml-15">{{ $t('base.addToPath') }}</span>
      </li>
      <template v-if="isVersionHide">
        <li @click.stop="doShow">
          <yb-icon :svg="import('@/svg/show.svg?raw')" width="17" height="17" />
          <span class="ml-15">{{ $t('base.noHide') }}</span>
        </li>
      </template>
      <template v-else>
        <li @click.stop="doHide">
          <yb-icon :svg="import('@/svg/hide.svg?raw')" width="17" height="17" />
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
import { computed } from 'vue'
import { BrewStore, SoftInstalled } from '@/store/brew'
import { ServiceActionStore } from './store'
import { AppStore } from '@/store/app'
import { AllAppModule } from '@/core/type';
import { stopService } from '@/util/Service';

const { dirname } = require('path')

const props = defineProps<{
  item: SoftInstalled
  type: AllAppModule
}>()

const store = AppStore()
const brewStore = BrewStore()

const excludeLocalVersion = computed(() => {
  return store.config.setup.excludeLocalVersion ?? []
})

const isVersionHide = computed(() => {
  return excludeLocalVersion?.value?.includes(props.item.bin)
})

const loading = computed(() => {
  return ServiceActionStore.pathSeting?.[props.item.bin] ?? false
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
  const server: any = store.config.server
  const current = server?.[props.type]?.current
  if (!current?.bin) {
    store.UPDATE_SERVER_CURRENT({
      flag: props.type,
      data: JSON.parse(JSON.stringify(props.item ?? {}))
    })
    store.saveConfig().then()
  }
}

const doHide = () => {
  store.serviceHide(props.item.bin)
  if (props.item?.run) {
    stopService(props.type, props.item)
  }
  const server: any = store.config.server
  const current = server?.[props.type]?.current
  if (current && current?.bin === props.item.bin) {
    const all = brewStore.module(props.type).installed
    const find = all.find((a) => a.bin !== props.item.bin && !excludeLocalVersion.value.includes(a.bin))
    store.UPDATE_SERVER_CURRENT({
      flag: props.type,
      data: JSON.parse(JSON.stringify(find ?? {}))
    })
    store.saveConfig().then()
  }
}
</script>
