import { AppStore } from '@/store/app'

export const EditorConfigMake = (value: string, readOnly: boolean, wordWrap: 'off' | 'on') => {
  const editorConfig = AppStore().editorConfig
  return {
    value,
    language: 'ini',
    readOnly,
    scrollBeyondLastLine: false,
    overviewRulerBorder: true,
    automaticLayout: true,
    wordWrap,
    theme: editorConfig.theme,
    fontSize: editorConfig.fontSize,
    lineHeight: editorConfig.lineHeight
  }
}
