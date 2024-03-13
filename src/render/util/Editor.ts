import { AppStore } from '@/store/app'

const { nativeTheme } = require('@electron/remote')

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
