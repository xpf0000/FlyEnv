<template>
  <el-dialog
    v-model="show"
    :title="I18nT('base.add') + ' Compose'"
    width="600px"
    :destroy-on-close="true"
    class="dark:bg-[#1d2033]"
    @closed="closedFn"
  >
    <el-form
      ref="formRef"
      :rules="rules"
      :model="form"
      label-width="110px"
      label-position="top"
      class="pt-2"
    >
      <el-form-item :label="I18nT('base.name')" prop="name" required>
        <el-input v-model="form.name" />
      </el-form-item>
      <el-form-item prop="paths" required>
        <template #label>
          <div class="inline-flex items-center gap-3">
            <span>{{ I18nT('podman.ComposeFile') }}</span>
            <el-button link type="primary" :icon="Plus" @click.stop="addFile"></el-button>
          </div>
        </template>
        <draggable
          v-model="form.paths"
          handle=".handle"
          class="w-full flex flex-col gap-2"
          item-key="id"
        >
          <template #item="{ element, index }">
            <div class="w-full flex items-center">
              <yb-icon
                v-if="form.paths.length > 1"
                class="handle w-[18px] h-[18px] cursor-move flex-shrink-0 mr-2"
                :svg="import('@/svg/handle.svg?raw')"
              />
              <el-input
                v-model="element.path"
                class="flex-1"
                :placeholder="I18nT('podman.PleaseSelectYmlFile')"
              >
                <template #append>
                  <el-button :icon="FolderOpened" @click="selectFile(index)"></el-button>
                </template>
              </el-input>
              <div
                v-if="form.paths.length > 1"
                class="w-[28px] h-[28px] flex items-center justify-center ml-2 flex-shrink-0"
              >
                <el-button
                  link
                  type="danger"
                  :icon="Delete"
                  @click.stop="delPath(index)"
                ></el-button>
              </div>
            </div>
          </template>
        </draggable>
      </el-form-item>
      <el-form-item :label="I18nT('host.projectName')" prop="flag">
        <el-input v-model="form.flag" placeholder="docker-compose -p xxxx" />
      </el-form-item>
      <el-form-item :label="I18nT('host.comment')" prop="comment">
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
  import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
  import { PodmanManager } from '@/components/Podman/class/Podman'
  import { FolderOpened, Plus, Delete } from '@element-plus/icons-vue'
  import { dialog } from '@/util/NodeFn'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { uuid } from '@/util/Index'
  import draggable from 'vuedraggable'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    item?: any
  }>()

  type FormItem = {
    id: string
    name: string
    flag: string
    comment: string
    paths: Array<{ path: string; id: string }>
  }

  const form = ref<FormItem>({
    id: uuid(),
    name: '',
    flag: '',
    comment: '',
    paths: [
      {
        id: uuid(),
        path: ''
      }
    ]
  })

  if (props?.item?.id) {
    Object.assign(form.value, props?.item)
    form.value.paths = props.item.paths.map((p: string) => ({ path: p }))
  }

  // 添加表单引用
  const formRef = ref<FormInstance>()

  // 定义表单验证规则
  const rules = ref<FormRules>({
    name: [
      { required: true, message: I18nT('base.name') + I18nT('podman.require'), trigger: 'blur' }
    ],
    flag: [
      {
        validator: (rule: any, value: string, callback: any) => {
          const regex = /^[a-z0-9][a-z0-9_-]*$/
          if (!regex.test(value)) {
            callback(new Error(I18nT('podman.ComposeNameErrorTips')))
            return
          }
          callback()
        },
        trigger: 'blur'
      }
    ],
    paths: [
      {
        validator: (rule: any, value: Array<{ path: string }>, callback: any) => {
          const isEmptyPath = value.every((item) => !item.path.trim())
          if (isEmptyPath) {
            callback(new Error(I18nT('podman.ComposeFileRequire')))
            return
          }
          callback()
        },
        trigger: 'blur'
      }
    ]
  })

  const onCancel = () => {
    show.value = false
  }

  const addFile = () => {
    form.value.paths.push({
      id: uuid(),
      path: ''
    })
  }

  const delPath = (index: number) => {
    form.value.paths.splice(index, 1)
  }

  // 文件选择器（Electron/Node环境下可用）
  const selectFile = async (index: number) => {
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
        form.value.paths[index].path = path
      })
  }

  const doSubmit = async () => {
    if (!form.value.name) {
      ElMessage.error(I18nT('base.name') + I18nT('podman.require'))
      return
    }

    try {
      // 验证表单
      await formRef.value?.validate()
    } catch {
      return
    }

    const paths = form.value.paths.map((p) => p.path).filter((p) => !!p.trim())
    if (!paths.length) {
      ElMessage.error(I18nT('podman.ComposeFileRequire'))
      return
    }

    if (!props?.item?.id) {
      const data = {
        ...form.value,
        paths
      }
      PodmanManager.addCompose(data)
    } else {
      const find = PodmanManager.compose.find((f) => f.id === form.value.id)
      console.log('find', find, PodmanManager.compose)
      if (find) {
        if (find.run) {
          find.stop()
        }
        find.name = form.value.name
        find.comment = form.value.comment
        find.flag = form.value.flag
        find.paths = paths
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
