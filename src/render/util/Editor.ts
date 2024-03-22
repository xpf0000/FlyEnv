import { AppStore } from '@/store/app'
import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css'
import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js'
import 'monaco-editor/esm/vs/language/json/monaco.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/php/php.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/mysql/mysql.contribution.js'

import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js'

import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import jsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

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

export const EditorConfigMake = (value: string, readOnly: boolean, wordWrap: 'off' | 'on') => {
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
    language: 'ini',
    readOnly,
    scrollBeyondLastLine: false,
    overviewRulerBorder: true,
    automaticLayout: true,
    wordWrap,
    theme: theme,
    fontSize: editorConfig.fontSize,
    lineHeight: editorConfig.lineHeight
  }
}

export const EditorCreate = (input: HTMLElement, config: any) => {
  return editor.create(input, config)
}
