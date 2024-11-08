import { nextTick, onMounted, onUnmounted, ref, watch, Ref } from 'vue'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'
import type { FSWatcher } from 'fs'
import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
import { EditorConfigMake, EditorCreate } from '@web/fn'

export const LogSetup = (file: Ref<string>) => {
  const logRef = ref()
  const log = ref('')
  let watcher: FSWatcher | null
  let monacoInstance: editor.IStandaloneCodeEditor | null

  const isDisabled = () => {
    return !file.value
  }

  const getLog = () => {
    log.value = file.value
  }

  const logDo = (action: 'open' | 'refresh' | 'clean') => {
    switch (action) {
      case 'open':
        break
      case 'refresh':
        break
      case 'clean':
        log.value = ''
        MessageSuccess(I18nT('base.success'))
        break
    }
  }

  const initEditor = () => {
    if (!monacoInstance) {
      const inputDom: HTMLElement = logRef.value as HTMLElement
      if (!inputDom || !inputDom?.style) {
        return
      }
      monacoInstance = EditorCreate(inputDom, EditorConfigMake(log.value, true, 'on'))
    } else {
      monacoInstance.setValue(log.value)
    }
  }

  watch(log, () => {
    nextTick().then(() => {
      initEditor()
    })
  })

  onMounted(() => {
    nextTick().then(() => {
      initEditor()
    })
  })

  onUnmounted(() => {
    monacoInstance && monacoInstance.dispose()
    monacoInstance = null
    if (watcher) {
      watcher.close()
      watcher = null
    }
  })

  getLog()

  watch(file, () => {
    getLog()
  })

  return {
    isDisabled,
    logDo,
    logRef
  }
}
