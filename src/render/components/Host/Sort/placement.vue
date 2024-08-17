<template>
  <el-popover
    placement="left"
    width="auto"
    trigger="hover"
    popper-class="host-sort-poper placement"
    :show-arrow="false"
    @show="onShow"
  >
    <template #reference>
      <li>
        <yb-icon :svg="import('@/svg/sort.svg?raw')" width="13" height="13" />
        <span class="ml-15">{{ $t('host.sort') }}</span>
      </li>
    </template>
    <template #default>
      <div ref="dom" v-poper-fix class="host-sort">
        <div class="top">
          <span>置顶</span>
          <el-switch></el-switch>
        </div>
        <el-slider vertical height="200px" />
      </div>
    </template>
  </el-popover>
</template>
<script lang="ts" setup>
  import { type Ref, ref } from 'vue'
  import { type AppHost, AppStore } from '@/store/app'

  const props = defineProps<{
    hostId: number
  }>()

  const dom = ref()

  const appStore = AppStore()

  let editHost: Ref<AppHost | undefined> = ref()

  const onShow = () => {
    console.log('onShow !!!', props.hostId)
    editHost.value = appStore.hosts.find((h) => h?.id === props?.hostId)
  }
</script>
