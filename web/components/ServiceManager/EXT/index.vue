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
  import type { SoftInstalled } from '@web/store/brew'
  import Extension from '../Pgsql/extension.vue'

  defineProps<{
    item: SoftInstalled
    type: string
  }>()

  const loading = computed(() => {
    return false
  })

  const state = computed(() => {
    return 'noset'
  })

  const onBeforEnter = () => {}

  const onShow = () => {
    console.log('onShow !!!')
  }

  const doChange = () => {}
</script>
