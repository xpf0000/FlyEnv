<template>
  <div class="json-parse host-edit">
    <div class="nav">
      <div class="left" @click="doClose">
        <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
        <span class="ml-15">JSON解析</span>
      </div>
    </div>

    <div class="main-wapper">
      <div ref="mainRef" class="main">
        <div class="left" :style="leftStyle">
          <div class="top">
            <span>{{ currentType }}</span>
          </div>
          <div ref="fromRef" class="editor el-input__wrapper"></div>
        </div>
        <div ref="moveRef" class="handle" @mousedown.stop="HandleMoveMouseDown"></div>
        <div class="right">
          <div class="top">
            <el-select v-model="to">
              <el-option label="JSON" value="json"></el-option>
              <el-option label="PHP Array" value="php"></el-option>
              <el-option label="JavaScript" value="js"></el-option>
              <el-option label="TypeScript" value="ts"></el-option>
              <el-option label="YAML" value="yml"></el-option>
              <el-option label="XML" value="xml"></el-option>
              <el-option label="PList" value="plist"></el-option>
            </el-select>
            <el-button-group>
              <el-button @click.stop="transformTo('asc')">
                <yb-icon :svg="import('@/svg/asc1.svg?raw')" width="18" height="18" />
              </el-button>
              <el-button @click.stop="transformTo('desc')">
                <yb-icon :svg="import('@/svg/desc1.svg?raw')" width="18" height="18" />
              </el-button>
              <el-button @click.stop="transformTo(undefined)">
                <yb-icon :svg="import('@/svg/nosort.svg?raw')" width="18" height="18" />
              </el-button>
            </el-button-group>
          </div>
          <div ref="toRef" class="editor el-input__wrapper"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted, ref, watch } from 'vue'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js'
  import 'monaco-editor/esm/vs/editor/contrib/format/browser/formatActions.js'
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
  import { PHPArrayParse } from '@shared/PHPArrayParse'
  import XMLParse from '@shared/XMLParse'
  import { FormatHtml } from '@shared/FormatCode'
  import PList from 'plist'

  const { nativeTheme } = require('@electron/remote')

  const emit = defineEmits(['doClose'])
  const to = ref('json')
  const moveRef = ref()
  const fromRef = ref()
  const toRef = ref()
  const mainRef = ref()

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
      foldingImportsByDefault: true
    }
  }

  let currentValue = ''
  let currentJsonValue: any = {}
  let currentType = ref('请输入内容')

  const transformTo = (sort?: 'asc' | 'desc') => {
    if (!currentJsonValue) {
      toEditor?.setValue('输入内容格式不正确')
      return
    }
    let json = JSON.parse(JSON.stringify(currentJsonValue))
    if (sort) {
      json = JSONSort(json, sort)
    }
    let value = ''
    if (to.value === 'json') {
      value = JSON.stringify(json, null, 4)
    } else if (to.value === 'js') {
      value = JSON5.stringify(json, {
        space: 4,
        quote: null
      })
    } else if (to.value === 'php') {
      if (currentType.value === 'PHP') {
        toEditor?.setValue(currentValue)
        const actions = toEditor?.getSupportedActions()
        console.log('actions: ', actions)
        toEditor?.getAction('editor.action.format').run()
        toEditor?.setValue(toEditor?.getValue())
        return
      } else {
        value = JSON.stringify(json, null, 4)
        value = value.replace(/": /g, `" => `).replace(/\{/g, '[').replace(/\}/g, ']')
      }
    } else if (to.value === 'xml') {
      if (currentType.value === 'XML') {
        FormatHtml(currentValue).then((xml: string) => {
          toEditor?.setValue(xml)
        })
        return
      }
      value = XMLParse.JSONToXML(json)
    } else if (to.value === 'plist') {
      if (currentType.value === 'PList') {
        FormatHtml(currentValue).then((xml: string) => {
          toEditor?.setValue(xml)
        })
        return
      }
      value = PList.build(json)
    }
    toEditor?.setValue(value)
  }
  const checkFrom = () => {
    let type = ''
    try {
      currentJsonValue = JSON5.parse(currentValue)
      type = 'JSON'
    } catch (e) {
      currentJsonValue = null
      type = ''
    }
    console.log('type 000: ', type)
    if (type) {
      currentType.value = type
      transformTo()
      return
    }

    try {
      currentJsonValue = PHPArrayParse(currentValue)
      type = 'PHP'
    } catch (e) {
      currentJsonValue = null
      type = ''
    }
    console.log('type 111: ', type)
    if (type) {
      currentType.value = type
      transformTo()
      return
    }

    try {
      currentJsonValue = PList.parse(currentValue)
      type = 'PList'
    } catch (e) {
      console.log('e 222: ', e)
      currentJsonValue = null
      type = ''
    }
    console.log('type 222: ', type)
    if (type) {
      currentType.value = type
      transformTo()
      return
    }

    try {
      currentJsonValue = XMLParse.XMLToJSON(currentValue)
      type = 'XML'
    } catch (e) {
      currentJsonValue = null
      type = ''
    }
    console.log('type 333: ', type)
    if (type) {
      currentType.value = type
      transformTo()
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

  const handleMoving = ref(false)
  let wapperRect: DOMRect = new DOMRect()
  const leftStyle = ref({})

  const maskDom = document.createElement('div')
  maskDom.classList.add('app-move-mask')

  const mouseMove = (e: MouseEvent) => {
    e?.stopPropagation && e?.stopPropagation()
    e?.preventDefault && e?.preventDefault()
    const left = e.clientX - wapperRect.left - 5
    leftStyle.value = {
      width: `${left}px`,
      flex: 'unset'
    }
  }
  const mouseUp = () => {
    document.removeEventListener('mousemove', mouseMove)
    document.removeEventListener('mouseup', mouseUp)
    maskDom.remove()
    handleMoving.value = false
  }
  const HandleMoveMouseDown = (e: MouseEvent) => {
    e.stopPropagation && e.stopPropagation()
    e.preventDefault && e.preventDefault()
    handleMoving.value = true
    const mainDom: HTMLElement = mainRef.value as any
    wapperRect = mainDom.getBoundingClientRect()
    document.body.append(maskDom)
    document.addEventListener('mousemove', mouseMove)
    document.addEventListener('mouseup', mouseUp)
  }

  onMounted(() => {
    initFromEditor()
    initToEditor()
  })

  watch(to, () => {
    transformTo()
  })
  const doClose = () => {
    emit('doClose')
  }
</script>
