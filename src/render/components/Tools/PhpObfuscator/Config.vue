<template>
  <el-drawer
    ref="host-edit-drawer"
    v-model="show"
    custom-class="host-edit-drawer"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-edit">
      <div class="nav pl-3 pr-5">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3">Php Obfuscator Config</span>
        </div>
        <el-dropdown split-button type="primary" @click="doSave" @command="handleCommand">
          {{ I18nT('base.confirm') }}
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="import">{{ I18nT('base.import') }}</el-dropdown-item>
              <el-dropdown-item command="export">{{ I18nT('base.export') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <div class="main-wapper">
        <div ref="input" class="block" style="width: 100%; height: 100%"></div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
  import { ref, onMounted, onUnmounted, nextTick } from 'vue'
  import { EditorConfigMake, EditorCreate, EditorDestroy } from '@/util/Editor'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { join } from '@/util/path-browserify'
  import { dialog, fs } from '@/util/NodeFn'
  import { I18nT } from '@lang/index'
  import type { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'

  const props = defineProps({
    customConfig: {
      type: String,
      default: ''
    }
  })

  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  let config = ''
  const input = ref<HTMLElement | null>(null)
  const localConfig = ref('')

  let monacoInstance: editor.IStandaloneCodeEditor | undefined

  const handleCommand = (command: 'import' | 'export') => {
    switch (command) {
      case 'import':
        loadCustom()
        break
      case 'export':
        saveCustom()
        break
    }
  }

  const loadCustom = async () => {
    const opt = ['openFile', 'showHiddenFiles']
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: opt
    })

    if (canceled || filePaths.length === 0) {
      return
    }

    const file = filePaths[0]
    const state = await fs.stat(file)
    if (state.size > 5 * 1024 * 1024) {
      MessageError(I18nT('base.fileBigErr'))
      return
    }

    const conf = await fs.readFile(file)
    localConfig.value = conf
    initEditor()
  }

  const saveCustom = async () => {
    const opt = ['showHiddenFiles', 'createDirectory', 'showOverwriteConfirmation']
    const { canceled, filePath } = await dialog.showSaveDialog({
      properties: opt,
      defaultPath: 'php-obfuscator.cnf',
      filters: [
        {
          extensions: ['cnf']
        }
      ]
    })

    if (canceled || !filePath) {
      return
    }

    const content = monacoInstance?.getValue?.() ?? ''
    await fs.writeFile(filePath, content)
    MessageSuccess(I18nT('base.success'))
  }

  const doSave = () => {
    const content = monacoInstance?.getValue?.()?.trim() ?? ''
    callback(content !== config ? content : undefined)
    show.value = false
  }

  const initEditor = async () => {
    if (!monacoInstance) {
      if (!input.value || !input.value?.style) {
        return
      }
      const editorConfig = await EditorConfigMake(localConfig.value, false, 'off')
      editorConfig.language = 'php'
      monacoInstance = EditorCreate(input.value, editorConfig)
    } else {
      monacoInstance.setValue(localConfig.value)
    }
  }

  onMounted(async () => {
    if (!config) {
      const file = join(window.Server.Static!, 'tmpl/yakpro-po.default.cnf')
      const c = await fs.readFile(file)
      config = c
      localConfig.value = props.customConfig || config
      await nextTick()
      initEditor().catch()
    } else {
      localConfig.value = props.customConfig || config
      await nextTick()
      initEditor().catch()
    }
  })

  onUnmounted(() => {
    console.log('onUnmounted !!!!!!')
    EditorDestroy(monacoInstance)
  })

  defineExpose({ show, onClosed, onSubmit, closedFn })
</script>
