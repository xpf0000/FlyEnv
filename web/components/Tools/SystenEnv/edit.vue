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
        <div class="nav">
          <div class="left" @click="show = false">
            <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
            <span class="ml-15">{{ file }}</span>
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
  import { AsyncComponentSetup } from '@web/fn'
  import { I18nT } from '@shared/lang'
  import { editor, KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { EditorConfigMake, EditorCreate } from '@web/fn'
  import IPC from '@/util/IPC'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import Base from '@web/core/Base'

  const { readFile, existsSync } = require('fs-extra')
  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    file: string
  }>()

  const disabled = ref(false)
  const content = ref('')
  const input = ref()
  const saving = ref(false)
  let monacoInstance: editor.IStandaloneCodeEditor | null

  const initEditor = () => {
    if (!monacoInstance) {
      if (!input?.value?.style) {
        return
      }
      monacoInstance = EditorCreate(input.value, EditorConfigMake(content.value, false, 'off'))
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
    if (!existsSync(props.file)) {
      content.value = I18nT('util.toolFileNotExist')
      disabled.value = true
      return
    }
    content.value = await readFile(props.file, 'utf-8')
    initEditor()
  }

  fetchContent().then()

  const doSubmit = () => {
    if (disabled.value || saving.value) {
      return
    }
    Base.ConfirmWarning(I18nT('util.toolSaveConfim')).then(() => {
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
    monacoInstance && monacoInstance.dispose()
    monacoInstance = null
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
