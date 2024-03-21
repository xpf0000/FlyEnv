<template>
  <div class="json-parse host-edit">
    <div class="nav">
      <div class="left" @click="doClose">
        <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
        <span class="ml-15">JSON解析</span>
      </div>
    </div>

    <div class="main-wapper">
      <el-tabs v-model="JSONStore.currentTab" :editable="true" type="card" @edit="handleTabsEdit">
        <template v-for="(_, key) in JSONStore.tabs" :key="key">
          <el-tab-pane :label="key" :name="key" :class="key" :closable="key !== 'tab-1'">
          </el-tab-pane>
        </template>
      </el-tabs>
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
            <el-select v-model="to" @change="onToChange">
              <el-option label="JSON" value="json"></el-option>
              <el-option label="PHP Array" value="php"></el-option>
              <el-option label="JavaScript" value="js"></el-option>
              <el-option label="TypeScript" value="ts"></el-option>
              <el-option label="YAML" value="yaml"></el-option>
              <el-option label="XML" value="xml"></el-option>
              <el-option label="PList" value="plist"></el-option>
              <el-option label="TOML" value="toml"></el-option>
            </el-select>
            <el-button-group>
              <el-button @click.stop="currentTab.transformTo('asc')">
                <yb-icon :svg="import('@/svg/asc1.svg?raw')" width="18" height="18" />
              </el-button>
              <el-button @click.stop="currentTab.transformTo('desc')">
                <yb-icon :svg="import('@/svg/desc1.svg?raw')" width="18" height="18" />
              </el-button>
              <el-button @click.stop="currentTab.transformTo(undefined)">
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
  import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
  import { editor, languages } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js'
  import 'monaco-editor/esm/vs/language/json/monaco.contribution.js'
  import 'monaco-editor/esm/vs/basic-languages/php/php.contribution.js'
  import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution.js'
  import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js'
  import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js'

  import 'monaco-editor/esm/vs/editor/browser/coreCommands.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js'
  import 'monaco-editor/esm/vs/editor/contrib/format/browser/format.js'
  import 'monaco-editor/esm/vs/editor/contrib/format/browser/formatActions.js' // 格式化代码
  import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js' // 代码联想提示
  import 'monaco-editor/esm/vs/editor/contrib/tokenization/browser/tokenization.js' // 代码联想提示
  import 'monaco-editor/esm/vs/editor/contrib/links/browser/links.js'

  import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
  import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
  import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
  import jsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
  import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

  import TomlRules from '@shared/transform/TomlRules'
  import { AppStore } from '@/store/app'
  import JSONStore, { JSONStoreTab } from '@/components/Tools/Json/store'
  import type { TabPaneName } from 'element-plus'

  const { nativeTheme } = require('@electron/remote')

  const workerJSON = new jsonWorker()
  const workerCss = new cssWorker()
  const workerHTML = new htmlWorker()
  const workerJS = new jsWorker()
  const workerDefault = new editorWorker()

  window.MonacoEnvironment = {
    getWorker: function (workerId: any, label: string) {
      console.log('getWorker: ', workerId, label)
      switch (label) {
        case 'json':
          return workerJSON
        case 'css':
        case 'scss':
        case 'less':
          return workerCss
        case 'html':
        case 'handlebars':
        case 'razor':
          return workerHTML
        case 'typescript':
        case 'javascript':
          return workerJS
        default:
          return workerDefault
      }
    }
  }

  // 注册自定义语言
  languages.register({ id: 'toml' })
  // 为该自定义语言基本的Token
  languages.setMonarchTokensProvider('toml', TomlRules as any)

  const emit = defineEmits(['doClose'])
  const moveRef = ref()
  const fromRef = ref()
  const toRef = ref()
  const mainRef = ref()

  const to = computed({
    get() {
      console.log('JSONStore: ', JSONStore)
      return JSONStore.tabs[JSONStore.currentTab].to
    },
    set(v: string) {
      JSONStore.tabs[JSONStore.currentTab].to = v
    }
  })
  const currentValue = computed({
    get() {
      return JSONStore.tabs[JSONStore.currentTab].value
    },
    set(v) {
      JSONStore.tabs[JSONStore.currentTab].value = v
    }
  })
  const currentType = computed({
    get() {
      return JSONStore.tabs[JSONStore.currentTab].type
    },
    set(v) {
      JSONStore.tabs[JSONStore.currentTab].type = v
    }
  })
  const currentToValue = computed({
    get() {
      return JSONStore.tabs[JSONStore.currentTab].toValue
    },
    set(v) {
      JSONStore.tabs[JSONStore.currentTab].toValue = v
    }
  })

  const currentToLang = computed({
    get() {
      return JSONStore.tabs[JSONStore.currentTab].toLang
    },
    set(v) {
      JSONStore.tabs[JSONStore.currentTab].toLang = v
    }
  })

  const currentTab = computed(() => {
    return JSONStore.tabs[JSONStore.currentTab]
  })

  const handleTabsEdit = (targetName: TabPaneName | undefined, action: 'remove' | 'add') => {
    if (action === 'add') {
      JSONStore.index += 1
      const tabName = `tab-${JSONStore.index}`
      const tab = new JSONStoreTab()
      tab.editor = () => toEditor!
      JSONStore.tabs[tabName] = reactive(tab)
      JSONStore.currentTab = tabName
    } else if (action === 'remove') {
      if (targetName === 'tab-1') {
        return
      }
      const allKeys = Object.keys(JSONStore.tabs)
      const index = allKeys.findIndex((k) => k === targetName)
      delete JSONStore.tabs?.[targetName!]
      if (targetName === JSONStore.currentTab) {
        JSONStore.currentTab = allKeys[index - 1]
      }
    }
  }

  let tabChanging = false

  let fromEditor: editor.IStandaloneCodeEditor | null
  let toEditor: editor.IStandaloneCodeEditor | null

  const EditorConfigMake = (value: string): editor.IStandaloneEditorConstructionOptions => {
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
      value,
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
      foldingImportsByDefault: true,
      formatOnPaste: true,
      formatOnType: true
    }
  }

  const initFromEditor = () => {
    if (!fromEditor) {
      if (!fromRef?.value?.style) {
        return
      }
      fromEditor = editor.create(fromRef.value, EditorConfigMake(currentValue.value))
      fromEditor.onDidChangeModelContent(() => {
        if (!tabChanging) {
          currentValue.value = fromEditor?.getValue() ?? ''
          currentTab.value.checkFrom()
        }
      })
    }
  }

  const initToEditor = () => {
    if (!toEditor) {
      if (!toRef?.value?.style) {
        return
      }
      toEditor = editor.create(toRef.value, EditorConfigMake(''))
      toEditor.onDidChangeModelContent(() => {
        if (!tabChanging) {
          currentToValue.value = toEditor?.getValue() ?? ''
        }
      })
      currentTab.value.editor = () => toEditor!
      console.log('actions: ', toEditor?.getSupportedActions())
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

  onUnmounted(() => {
    fromEditor && fromEditor.dispose()
    fromEditor = null
    toEditor && toEditor.dispose()
    toEditor = null
  })

  const onToChange = (v: any) => {
    console.log('onToChange !!!', v)
    if (!tabChanging) {
      currentTab.value.transformTo()
    }
  }

  watch(
    () => JSONStore.currentTab,
    () => {
      tabChanging = true
      fromEditor?.setValue(currentValue.value)
      toEditor?.setValue(currentToValue.value)
      const model = toEditor!.getModel()!
      editor.setModelLanguage(model, currentToLang.value)
      nextTick().then(() => {
        tabChanging = false
      })
    }
  )
  const doClose = () => {
    emit('doClose')
  }
</script>
