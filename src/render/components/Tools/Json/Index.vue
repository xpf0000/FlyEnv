<template>
  <div class="json-parse host-edit">
    <div class="nav">
      <div class="left" @click="doClose">
        <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
        <span class="ml-15">JSON解析</span>
      </div>
    </div>

    <div class="main-wapper">
      <div class="main">
        <div class="left">
          <div class="top">
            <span>{{ currentType }}</span>
          </div>
          <div ref="fromRef" class="editor el-input__wrapper"></div>
        </div>
        <div class="center">
          <el-button :icon="Right"></el-button>
          <el-button :icon="Back"></el-button>
        </div>
        <div class="right">
          <div class="top">
            <el-select v-model="to">
              <el-option label="JSON" value="json"></el-option>
              <el-option label="PHP Array" value="php"></el-option>
              <el-option label="JavaScript" value="js"></el-option>
              <el-option label="TypeScript" value="ts"></el-option>
              <el-option label="YAML" value="yml"></el-option>
              <el-option label="XML" value="xml"></el-option>
            </el-select>
            <el-button>
              <yb-icon :svg="import('@/svg/asc1.svg?raw')" width="18" height="18" />
            </el-button>
            <el-button>
              <yb-icon :svg="import('@/svg/desc1.svg?raw')" width="18" height="18" />
            </el-button>
          </div>
          <div ref="toRef" class="editor el-input__wrapper"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted, ref } from 'vue'
  import { Right, Back } from '@element-plus/icons-vue'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js'
  import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js'
  import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution.js'
  import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js'
  import 'monaco-editor/esm/vs/basic-languages/php/php.contribution.js'
  import 'monaco-editor/esm/vs/language/json/monaco.contribution.js'
  import { AppStore } from '@/store/app'
  import JSON5 from 'json5'
  import { JSONSort } from '@shared/JsonSort'

  const { nativeTheme } = require('@electron/remote')

  const emit = defineEmits(['doClose'])
  const to = ref('json')
  const fromRef = ref()
  const toRef = ref()

  let fromEditor: editor.IStandaloneCodeEditor | null
  let toEditor: editor.IStandaloneCodeEditor | null

  const EditorConfigMake = (): editor.IStandaloneEditorConstructionOptions => {
    const appStore = AppStore()
    const editorConfig = appStore.editorConfig
    let theme = editorConfig.theme
    if (theme === 'auto') {
      let appTheme = appStore?.config?.setup?.theme ?? ''
      if (!appTheme || appTheme === 'system') {
        appTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
      }
      if (appTheme === 'light') {
        theme = 'vs-light'
      } else {
        theme = 'vs-dark'
      }
    }
    return {
      value: '',
      language: 'javascript',
      readOnly: false,
      scrollBeyondLastLine: false,
      overviewRulerBorder: true,
      automaticLayout: true,
      wordWrap: 'on',
      theme: theme,
      fontSize: editorConfig.fontSize,
      lineHeight: editorConfig.lineHeight,
      lineNumbersMinChars: 2,
      folding: true,
      showFoldingControls: 'always',
      foldingStrategy: 'indentation',
      foldingImportsByDefault: true,
      formatOnPaste: true //是否粘贴自动格式化
    }
  }

  let currentValue = ''
  let currentJsonValue = {}
  let currentType = ref('')

  const checkFrom = () => {
    let type = ''
    try {
      currentJsonValue = JSON5.parse(currentValue)
      type = 'JSON'
    } catch (e) {
      currentJsonValue = ''
      console.log('e 000: ', e)
      type = ''
    }
    console.log('type 000: ', type, currentJsonValue)
    if (type) {
      currentType.value = type
      currentJsonValue = JSONSort(currentJsonValue)
      let value = ''
      if (to.value === 'json') {
        value = JSON.stringify(currentJsonValue, null, 4)
      } else if (to.value === 'js') {
        value = JSON5.stringify(currentJsonValue, {
          space: 4,
          quote: null
        })
      }
      toEditor?.setValue(value)
      return
    }

    try {
      const obj = eval(currentValue)
      const rawType = Object.prototype.toString.call(obj)
      console.log('rawType: ', rawType)
      if (['[object Object]', '[object Array]'].includes(rawType)) {
        type = 'JavaScript'
      }
    } catch (e) {
      console.log('e 111: ', e)
      type = ''
    }
    console.log('type 111: ', type)
    if (type) {
      currentType.value = type
      return
    }
  }

  const onFromChanged = () => {
    const value = fromEditor?.getValue() ?? ''
    console.log('onFromChanged: ', value)
    currentValue = value
    checkFrom()
  }
  const initFromEditor = () => {
    if (!fromEditor) {
      if (!fromRef?.value?.style) {
        return
      }
      fromEditor = editor.create(fromRef.value, EditorConfigMake())
      fromEditor.onDidChangeModelContent(onFromChanged)
    }
  }

  const initToEditor = () => {
    if (!toEditor) {
      if (!toRef?.value?.style) {
        return
      }
      toEditor = editor.create(toRef.value, EditorConfigMake())
    }
  }

  onMounted(() => {
    initFromEditor()
    initToEditor()
  })

  const doClose = () => {
    emit('doClose')
  }
</script>
