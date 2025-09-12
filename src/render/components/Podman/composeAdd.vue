<template>
  <el-dialog
    v-model="show"
    :title="I18nT('base.add') + ' Compose'"
    width="500px"
    @closed="closedFn"
  >
    <template #header>
      <div class="w-full flex items-center justify-center">
        <el-radio-group v-model="tab" size="small" class="ml-[24px]">
          <el-radio-button value="file">选择文件</el-radio-button>
          <el-radio-button value="build">构建</el-radio-button>
        </el-radio-group>
      </div>
    </template>
    <el-form :model="form" label-width="110px" label-position="top" class="pt-2">
      <el-form-item :label="I18nT('base.name')" prop="name" required>
        <el-input v-model="form.name" />
      </el-form-item>
      <el-form-item v-if="!item?.path" :label="I18nT('base.path')" prop="path" required>
        <el-input v-model="form.path" placeholder="请选择 .yml 文件">
          <template #append>
            <el-button :icon="FolderOpened" @click="selectFile"></el-button>
          </template>
        </el-input>
      </el-form-item>
      <el-form-item :label="I18nT('host.comment')" prop="comment" required>
        <el-input v-model="form.comment" type="textarea" :rows="4" />
      </el-form-item>
    </el-form>
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

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    item?: any
  }>()

  const form = ref({
    name: '',
    comment: '',
    path: ''
  })

  Object.assign(form.value, props?.item)

  const tab = ref('file')

  const onCancel = () => {
    show.value = false
  }

  // 文件选择器（Electron/Node环境下可用）
  const selectFile = async () => {
    dialog
      .showOpenDialog({
        properties: ['openFile', 'showHiddenFiles'],
        filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }]
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        form.value.path = path
      })
  }

  const doSubmit = async () => {
    if (!form.value.name) {
      ElMessage.error(I18nT('base.name') + I18nT('podman.require'))
      return
    }
    if (!form.value.path) {
      ElMessage.error(I18nT('base.path') + I18nT('podman.require'))
      return
    }
    if (!props?.item?.path) {
      PodmanManager.addCompose(form.value)
    } else {
      const find = PodmanManager.compose.find((f) => f.path === form.value.path)
      if (find) {
        find.name = form.value.name
        find.comment = form.value.comment
        PodmanManager.saveComposeList().catch()
      }
    }
    ElMessage.success(I18nT('base.success'))
    show.value = false
  }

  defineExpose({
    show,
    onClosed,
    onSubmit,
    closedFn
  })
</script>
