<template>
  <el-dialog
    v-model="show"
    :title="title"
    class="el-dialog-content-flex-1 app-xterm-exec-dialog"
    @closed="closedFn"
    @open="onOpen"
  >
    <template #default>
      <div class="w-full h-full">
        <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
      </div>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <el-button v-if="item.installing && !item.installEnd" @click.stop="onCancel">{{
          I18nT('base.cancel')
        }}</el-button>
        <el-button v-if="item.installEnd" type="primary" @click.stop="doSubmit">{{
          I18nT('base.confirm')
        }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { onBeforeUnmount, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { XTermExec } from '@/util/XTermExec'

  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const props = defineProps<{
    title: string
    item: XTermExec
  }>()

  const xtermDom = ref<HTMLElement>()

  const onCancel = () => {
    props.item.taskCancel()
    show.value = false
  }

  const doSubmit = () => {
    props.item.taskConfirm()
    show.value = false
    callback(true)
  }

  const onOpen = () => {
    if (xtermDom?.value) {
      if (props.item.installing || props.item.installEnd) {
        props.item.mount(xtermDom.value!)
      } else {
        props.item.exec(xtermDom.value!, props.item.cammand)
      }
    }
  }

  onBeforeUnmount(() => {
    props.item.unmount()
  })

  defineExpose({
    show,
    onClosed,
    onSubmit,
    closedFn
  })
</script>
<style lang="scss">
  .el-dialog {
    &.app-xterm-exec-dialog {
      width: 75%;
      min-width: 600px;
      height: 75%;
    }
  }
</style>
