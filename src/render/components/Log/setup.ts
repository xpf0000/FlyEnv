import { nextTick, onMounted, onUnmounted, ref, watch, Ref, markRaw } from 'vue'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import type { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
import { EditorConfigMake, EditorCreate, EditorDestroy } from '@/util/Editor'
import IPC from '@/util/IPC'
import { shell, fs, FileWatcher } from '@/util/NodeFn'
import { asyncComputed } from '@vueuse/core'

export const LogSetup = (file: Ref<string>) => {
  const logRef = ref()
  const log = ref('')
  let watcher: FileWatcher | null
  let monacoInstance: editor.IStandaloneCodeEditor | undefined

  const fileExists = asyncComputed(async () => {
    if (!file.value) {
      return false
    }
    return await fs.existsSync(file.value)
  })

  const isDisabled = () => {
    return !file.value || !fileExists?.value
  }

  const getLog = () => {
    if (fileExists?.value) {
      const watchLog = () => {
        if (watcher) {
          watcher.close()
          watcher = null
        }
        if (!watcher) {
          watcher = markRaw(
            new FileWatcher(file.value, () => {
              read().then()
            })
          )
        }
      }

      const read = () => {
        return new Promise((resolve) => {
          fs.readFile(file.value)
            .then((str: string) => {
              log.value = str
              resolve(true)
            })
            .catch(() => {
              IPC.send(`app-fork:tools`, 'readFileByRoot', file.value).then(
                (key: string, res: any) => {
                  IPC.off(key)
                  log.value = res?.data ?? ''
                  resolve(true)
                }
              )
            })
        })
      }
      read().then(() => {
        watchLog()
      })
    } else {
      log.value = I18nT('base.noLogs')
    }
  }

  const logDo = (action: 'open' | 'refresh' | 'clean') => {
    if (!fileExists?.value) {
      MessageError(I18nT('base.logFileNotFound'))
      return
    }
    switch (action) {
      case 'open':
        shell.showItemInFolder(file.value)
        break
      case 'refresh':
        getLog()
        break
      case 'clean':
        fs.writeFile(file.value, '')
          .then(() => {
            log.value = ''
            MessageSuccess(I18nT('base.success'))
          })
          .catch(() => {
            IPC.send(`app-fork:tools`, 'writeFileByRoot', file.value, '').then((key: string) => {
              IPC.off(key)
              MessageSuccess(I18nT('base.success'))
            })
          })
        break
    }
  }

  const initEditor = async () => {
    if (!monacoInstance) {
      const inputDom: HTMLElement = logRef.value as HTMLElement
      if (!inputDom || !inputDom?.style) {
        return
      }
      monacoInstance = EditorCreate(inputDom, await EditorConfigMake(log.value, true, 'on'))
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
    EditorDestroy(monacoInstance)
    if (watcher) {
      watcher.close()
      watcher = null
    }
  })

  getLog()

  watch(fileExists, (v) => {
    if (v) {
      getLog()
    }
  })

  return {
    isDisabled,
    logDo,
    logRef
  }
}
