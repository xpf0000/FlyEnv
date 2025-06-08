<template>
  <div class="host-edit">
    <div class="nav">
      <div class="left" @click="doClose">
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
</template>

<script setup lang="ts">
  import { ref, onMounted, onUnmounted, nextTick } from 'vue'
  import { EditorConfigMake, EditorCreate } from '@/util/Editor'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { join } from 'path-browserify'
  import { dialog, fs } from '@/util/NodeFn'
  import { I18nT } from '@lang/index'

  const props = defineProps({
    customConfig: {
      type: String,
      default: ''
    }
  })

  const emit = defineEmits(['doClose'])

  let config = ''
  const input = ref<HTMLElement | null>(null)
  const monacoInstance = ref<any>(null)
  const localConfig = ref('')

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

    const content = monacoInstance.value.getValue()
    await fs.writeFile(filePath, content)
    MessageSuccess(I18nT('base.success'))
  }

  const doSave = () => {
    const content = monacoInstance.value.getValue().trim()
    emit('doClose', content !== config ? content : undefined)
  }

  const initEditor = () => {
    if (!monacoInstance.value) {
      if (!input.value || !input.value?.style) {
        return
      }
      const editorConfig = EditorConfigMake(localConfig.value, false, 'off')
      editorConfig.language = 'php'
      monacoInstance.value = EditorCreate(input.value, editorConfig)
    } else {
      monacoInstance.value.setValue(localConfig.value)
    }
  }

  const doClose = () => {
    emit('doClose')
  }

  onMounted(async () => {
    if (!config) {
      const file = join(window.Server.Static!, 'tmpl/yakpro-po.default.cnf')
      const c = await fs.readFile(file)
      config = c
      localConfig.value = props.customConfig || config
      await nextTick()
      initEditor()
    } else {
      localConfig.value = props.customConfig || config
      await nextTick()
      initEditor()
    }
  })

  onUnmounted(() => {
    monacoInstance.value?.dispose()
    monacoInstance.value = null
  })
</script>
