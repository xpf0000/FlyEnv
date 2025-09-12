<template>
  <el-dialog
    v-model="show"
    :title="I18nT('base.add') + ' Compose'"
    width="500px"
    @closed="closedFn"
  >
    <template #default>
      <div class="w-full h-full">
        <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
      </div>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click.stop="onCancel">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" @click.stop="doSubmit">{{ I18nT('base.confirm') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { ElMessage } from 'element-plus'
  import { PodmanManager } from '@/components/Podman/class/Podman'
  import { FolderOpened } from '@element-plus/icons-vue'
  import { dialog } from '@/util/NodeFn'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { XTermExec } from '@/util/XTermExec'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    item: XTermExec
    cammand: string[]
  }>()

  defineExpose({
    show,
    onClosed,
    onSubmit,
    closedFn
  })
</script>
