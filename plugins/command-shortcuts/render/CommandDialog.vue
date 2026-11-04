<template>
  <el-dialog
    :model-value="true"
    :title="ShortcutsT(preset ? 'editCommand' : 'addCommand')"
    width="640px"
    :close-on-click-modal="false"
    :before-close="close"
    destroy-on-close
  >
    <div class="mb-4 flex min-w-0 items-center gap-3">
      <FolderAvatar :id="folder.id" :name="folder.name" />
      <div class="min-w-0 flex-1">
        <div class="font-medium">{{ folder.name }}</div>
        <button
          type="button"
          class="block w-full break-all text-left text-sm text-yellow-500"
          :disabled="manager.isOpeningPath(folder.id)"
          @click="manager.openFolderPath(folder.id)"
          >{{ folder.path }}</button
        >
      </div>
    </div>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="save">
      <el-form-item :label="ShortcutsT('description')" prop="description">
        <el-input v-model="form.description" autofocus />
      </el-form-item>
      <el-form-item :label="ShortcutsT('command')" prop="command">
        <el-input
          v-model="form.command"
          type="textarea"
          :rows="7"
          class="command-shortcuts-command-input"
          spellcheck="false"
        />
        <div class="mt-2 text-xs text-[var(--el-text-color-secondary)]">{{
          ShortcutsT(isWindows ? 'windowsHint' : 'unixHint')
        }}</div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="manager.saving" @click="close">{{ ShortcutsT('cancel') }}</el-button>
      <el-button type="primary" :loading="manager.saving" @click="save">{{
        ShortcutsT('save')
      }}</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { reactive, ref } from 'vue'
  import type { FormInstance, FormRules } from 'element-plus'
  import type { CommandFolder, PresetCommand } from '../shared'
  import { CommandShortcutsManager as manager } from './manager'
  import { ShortcutsT } from './lang'
  import FolderAvatar from './FolderAvatar.vue'

  const props = defineProps<{ folder: CommandFolder; preset?: PresetCommand }>()
  const emit = defineEmits<{ close: [] }>()
  const isWindows = window.Server.isWindows
  const formRef = ref<FormInstance>()
  const form = reactive({
    description: props.preset?.description ?? '',
    command: props.preset?.command ?? ''
  })
  const required = {
    required: true,
    whitespace: true,
    message: ShortcutsT('required'),
    trigger: 'blur'
  }
  const rules: FormRules = { description: [required], command: [required] }
  const close = () => {
    if (!manager.saving) emit('close')
  }
  const save = async () => {
    if (!(await formRef.value?.validate().catch(() => false))) return
    if (await manager.saveCommand(props.folder.id, form, props.preset?.id)) emit('close')
  }
</script>

<style scoped>
  .command-shortcuts-command-input :deep(textarea) {
    font-family: var(--el-font-family-monospace, monospace);
  }
</style>
