<template>
  <el-popover
    ref="popper"
    effect="dark"
    popper-class="host-list-poper"
    placement="left-start"
    :show-arrow="false"
    width="auto"
    @before-enter="onBeforEnter"
    @show="onShow"
  >
    <ul v-poper-fix class="host-list-menu">
      <li class="path-set" :class="state" @click.stop="doChange">
        <template v-if="loading">
          <el-button style="width: auto; height: auto" text :loading="true"></el-button>
        </template>
        <template v-else>
          <yb-icon class="current" :class="{
            'text-blue-500': isInAppEnv,
            'opacity-100': isInAppEnv
          }" :svg="import('@/svg/select.svg?raw')" width="17" height="17" />
        </template>
        <span class="ml-15">{{ I18nT('base.addToPath') }}</span>
      </li>
      <li @click.stop="doSetAlias">
        <yb-icon class="current" :svg="import('@/svg/aliase.svg?raw')" width="17" height="17" />
        <span class="ml-15">{{ I18nT('service.setaliase') }}</span>
      </li>
      <template v-if="showHideShow">
        <template v-if="isVersionHide">
          <li @click.stop="doShow">
            <yb-icon :svg="import('@/svg/show.svg?raw')" width="17" height="17" />
            <span class="ml-15">{{ I18nT('base.noHide') }}</span>
          </li>
        </template>
        <template v-else>
          <li @click.stop="doHide">
            <yb-icon :svg="import('@/svg/hide.svg?raw')" width="17" height="17" />
            <span class="ml-15">{{ I18nT('base.hide') }}</span>
          </li>
        </template>
      </template>
      <li @click.stop="ServiceActionStore.delVersion(item, type)">
        <yb-icon :svg="import('@/svg/trash.svg?raw')" width="15" height="15" />
        <span class="ml-15">{{ I18nT('base.del') }}</span>
      </li>
    </ul>
    <template #reference>
      <el-button link class="status">
        <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
      </el-button>
    </template>
  </el-popover>
</template>
<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { BrewStore, SoftInstalled } from '@/store/brew'
  import { ServiceActionStore } from './store'
  import { AppStore } from '@/store/app'
  import { AllAppModule } from '@/core/type'
  import { stopService } from '@/util/Service'
  import { I18nT } from '@lang/index'

  const { dirname } = require('path')

  const props = defineProps<{
    item: SoftInstalled
    type: AllAppModule
    showHideShow?: boolean
  }>()

  const popper = ref()
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

  const isInAppEnv = computed(() => {
    return ServiceActionStore.appPath.includes(props.item.path)
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
    if(loading.value) {
      return
    }
    ServiceActionStore.updatePath(props.item, props.type).then().catch()
  }

  const doSetAlias = () => {
    popper.value.hide()
    const item: SoftInstalled = props.item
    ServiceActionStore.showAlias(item)
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
      const find = all.find(
        (a) => a.bin !== props.item.bin && !excludeLocalVersion.value.includes(a.bin)
      )
      store.UPDATE_SERVER_CURRENT({
        flag: props.type,
        data: JSON.parse(JSON.stringify(find ?? {}))
      })
      store.saveConfig().then()
    }
  }
</script>
