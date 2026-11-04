import { nextTick, onMounted, onUnmounted, ref, watch, Ref, markRaw } from 'vue'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import type { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
import { EditorConfigMake, EditorCreate, EditorDestroy } from '@/util/Editor'
import { shell, fs, FileWatcher } from '@/util/NodeFn'
import type { SoftInstalled } from '@/store/brew'
import { MssqlManager } from '../store'

// Existing Log/setup pattern, with plugin-owned UTF-16 reading for the current host.
export const LogSetup = (file: Ref<string>, version: () => SoftInstalled | undefined) => {
  const logRef = ref()
  const log = ref('')
  let disposed = false
  let readGeneration = 0
  let watcher: FileWatcher | null = null
  let monacoInstance: editor.IStandaloneCodeEditor | undefined

  // A protected SQL log can exist even when the ordinary token cannot stat it.
  const isDisabled = () => !file.value

  const getLog = async (allowAutomaticRepair = true) => {
    if (disposed) return
    const generation = ++readGeneration
    const path = file.value
    const selected = version()
    const active = () => !disposed && generation === readGeneration && path === file.value
    if (!path || !selected) {
      log.value = I18nT('base.noLogs')
      return
    }
    try {
      const content = await MssqlManager.readLogFile(selected, allowAutomaticRepair)
      if (!active()) return
      log.value = content
    } catch (error) {
      if (active()) {
        if (/ENOENT/.test(`${error}`)) log.value = I18nT('base.noLogs')
        else MessageError(`${I18nT('base.fail')}: ${error}`)
      }
      return
    }
    // Watching is supplementary: a watcher failure does not discard a completed read.
    if (!watcher && active()) {
      try {
        watcher = markRaw(new FileWatcher(path, () => void getLog(false)))
      } catch (error) {
        MessageError(`${I18nT('base.fail')}: ${error}`)
      }
    }
  }

  const logDo = (action: 'open' | 'refresh' | 'clean') => {
    if (!file.value) {
      MessageError(I18nT('base.logFileNotFound'))
      return
    }
    const path = file.value
    const active = () => !disposed && file.value === path
    switch (action) {
      case 'open':
        shell.showItemInFolder(path)
        break
      case 'refresh':
        void getLog()
        break
      case 'clean':
        fs.writeFile(path, '')
          .then(() => {
            if (!active()) return
            readGeneration++
            log.value = ''
            MessageSuccess(I18nT('base.success'))
          })
          .catch((error) => {
            if (active()) MessageError(`${I18nT('base.fail')}: ${error}`)
          })
        break
    }
  }

  const initEditor = async () => {
    if (disposed) return
    if (!monacoInstance) {
      const inputDom: HTMLElement = logRef.value as HTMLElement
      if (!inputDom || !inputDom?.style) {
        return
      }
      const config = await EditorConfigMake(log.value, true, 'on')
      if (disposed) return
      monacoInstance = EditorCreate(inputDom, config)
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
    disposed = true
    readGeneration++
    EditorDestroy(monacoInstance)
    if (watcher) {
      watcher.close()
      watcher = null
    }
  })

  void getLog()

  watch(file, () => {
    readGeneration++
    watcher?.close()
    watcher = null
    void getLog()
  })

  return {
    isDisabled,
    logDo,
    logRef
  }
}
