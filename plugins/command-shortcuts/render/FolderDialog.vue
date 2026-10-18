<template>
  <el-dialog
    :model-value="true"
    :title="ShortcutsT(folder ? 'editFolder' : 'addFolder')"
    width="560px"
    :close-on-click-modal="false"
    :before-close="close"
    destroy-on-close
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="save">
      <el-form-item :label="ShortcutsT('name')" prop="name">
        <el-input v-model="form.name" autofocus />
      </el-form-item>
      <el-form-item :label="ShortcutsT('path')" prop="path">
        <el-input v-model="form.path">
          <template #append>
            <el-button :loading="choosing" @click="choose">{{
              ShortcutsT('chooseFolder')
            }}</el-button>
          </template>
        </el-input>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="manager.saving" @click="close">{{ ShortcutsT('cancel') }}</el-button>
      <el-button type="primary" :loading="manager.saving" :disabled="choosing" @click="save">{{
        ShortcutsT('save')
      }}</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { reactive, ref } from 'vue'
  import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
  import { dialog } from '@/util/NodeFn'
  import type { CommandFolder } from '../shared'
  import { errorText } from '../shared'
  import { CommandShortcutsManager as manager } from './manager'
  import { ShortcutsT } from './lang'

  const props = defineProps<{ folder?: CommandFolder }>()
  const emit = defineEmits<{ close: [] }>()
  const formRef = ref<FormInstance>()
  const choosing = ref(false)
  const form = reactive({
    name: props.folder?.name ?? '',
    path: props.folder?.path ?? ''
  })
  const required = {
    required: true,
    whitespace: true,
    message: ShortcutsT('required'),
    trigger: 'blur'
  }
  const rules: FormRules = { name: [required], path: [required] }

  const close = () => {
    if (!manager.saving) emit('close')
  }
  const choose = async () => {
    choosing.value = true
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        defaultPath: form.path || undefined
      })
      if (!result.canceled && result.filePaths[0]) form.path = result.filePaths[0]
    } catch (error) {
      ElMessage.error(errorText(error))
    } finally {
      choosing.value = false
    }
  }
  const save = async () => {
    if (choosing.value || !(await formRef.value?.validate().catch(() => false))) return
    if (await manager.saveFolder(form, props.folder?.id)) emit('close')
  }
</script>
