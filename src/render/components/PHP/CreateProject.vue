<template>
  <el-card class="w-full h-full overflow-hidden p-3 app-base-el-card">
    <Create @on-make-host="onMakeHost" />
  </el-card>
</template>

<script lang="ts" setup>
  import Create from '@/components/Host/CreateProject/php.vue'
  import { AsyncComponentShow } from '@/util/AsyncComponent'

  let EditVM: any
  import('@/components/Host/Edit.vue').then((res) => {
    EditVM = res.default
  })
  const onMakeHost = (res: any) => {
    AsyncComponentShow(EditVM, {
      edit: {
        root: res.dir,
        nginx: {
          rewrite: res.rewrite
        }
      }
    }).then()
  }
</script>
