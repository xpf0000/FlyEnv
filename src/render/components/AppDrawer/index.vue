<template>
  <el-drawer
    v-model="show"
    :size="size"
    :destroy-on-close="destroyOnClose"
    :with-header="false"
    :class="drawerClass"
    @closed="closedFn"
  >
    <component :is="component" @do-close="hide"></component>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { AsyncComponentSetup } from '@/util/AsyncComponent'

  withDefaults(
    defineProps<{
      component?: any
      destroyOnClose?: boolean
      size?: string
      drawerClass?: string
    }>(),
    {
      destroyOnClose: true,
      size: '75%'
    }
  )

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const hide = () => {
    show.value = false
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
