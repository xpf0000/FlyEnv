<template>
  <el-button class="mr-2" link @click.stop="showLog()">
    <yb-icon :svg="import('@/svg/log1.svg?raw')" width="17" height="17" />
  </el-button>
</template>
<script lang="ts" setup>
  import { AsyncComponentShow } from '@/util/AsyncComponent'

  let LogVM: any
  import('./log.vue').then((res) => {
    LogVM = res.default
  })
  const showLog = () => {
    AsyncComponentShow(LogVM).then()
  }
</script>
