<template>
  <el-drawer
    v-model="show"
    :title="null"
    :with-header="false"
    size="75%"
    :destroy-on-close="true"
    @closed="closedFn"
  >
    <template #default>
      <div class="host-edit">
        <div class="nav pl-3 pr-5">
          <div class="left" @click="show = false">
            <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
            <span class="ml-3">{{ file }}</span>
          </div>
          <el-button
            type="primary"
            class="shrink0"
            :disabled="disabled || saving"
            :loading="saving"
            @click="doSubmit"
            >{{ $t('base.confirm') }}</el-button
          >
        </div>
        <div class="main-wapper">
          <div ref="input" class="block" style="width: 100%; height: 100%"></div>
        </div>
      </div>
    </template>
  </el-drawer>
</template>
<script lang="ts" setup>
  import { nextTick, onMounted, onUnmounted, ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'
  import type { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { EditorConfigMake, EditorCreate, EditorDestroy } from '@/util/Editor'
  import IPC from '@/util/IPC'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import Base from '@/core/Base'
  import { fs } from '@/util/NodeFn'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    file: string
  }>()

  const disabled = ref(false)
  const content = ref('')
  const input = ref()
  const saving = ref(false)
  let monacoInstance: editor.IStandaloneCodeEditor | undefined

  const initEditor = async () => {
    if (!monacoInstance) {
      if (!input?.value?.style) {
        return
      }
      monacoInstance = EditorCreate(
        input.value,
        await EditorConfigMake(content.value, false, 'off')
      )
      monacoInstance.addAction({
        id: 'save',
        label: 'save',
        keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
        run: () => {
          doSubmit()
        }
      })
    } else {
      monacoInstance.setValue(content.value)
    }
  }

  const fetchContent = async () => {
    const exists = await fs.existsSync(props.file)
    if (!exists) {
      content.value = I18nT('util.toolFileNotExist')
      disabled.value = true
      return
    }
    content.value = await fs.readFile(props.file)
    initEditor()
  }

  fetchContent().then()

  const doSubmit = () => {
    if (disabled.value || saving.value) {
      return
    }
    Base.ConfirmWarning(I18nT('util.toolSaveConfirm')).then(() => {
      saving.value = true
      IPC.send(
        'app-fork:tools',
        'systemEnvSave',
        props.file,
        monacoInstance?.getValue() ?? ''
      ).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          MessageSuccess(I18nT('base.success'))
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        saving.value = false
      })
    })
  }

  onMounted(() => {
    nextTick().then(() => {
      initEditor()
    })
  })

  onUnmounted(() => {
    EditorDestroy(monacoInstance)
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
