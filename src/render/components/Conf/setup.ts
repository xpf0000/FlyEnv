import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch, ComputedRef } from 'vue'
import { editor, KeyMod, KeyCode } from 'monaco-editor/esm/vs/editor/editor.api.js'
import { EditorConfigMake, EditorCreate } from '@/util/Editor'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'
import type { AllAppModule } from '@/core/type'
import IPC from '@/util/IPC'

const { dialog } = require('@electron/remote')
const { shell } = require('@electron/remote')
const { existsSync, writeFile, readFile, statSync } = require('fs-extra')

type CommonSetItemOption = {
  label: string
  value: string
}

export type CommonSetItem = {
  name: string
  value: string
  enable: boolean
  show?: boolean
  showEnable?: boolean
  type?: string
  isFile?: boolean
  isDir?: boolean
  options?: CommonSetItemOption[]
  tips: () => string
  onChange?: (newValue: any, oldValue: any) => void
  key?: string
}

type ConfStoreType = {
  types: Record<AllAppModule, 'default' | 'common'>
  phpIniFiles: Record<string, string>
  save: () => void
}

export const ConfStore: ConfStoreType = reactive({
  types: {},
  phpIniFiles: {},
  save() {
    localStorage.setItem('PWS-CONF-STORE', JSON.stringify(this))
  }
} as ConfStoreType)

const tab: any = localStorage.getItem('PWS-CONF-STORE')
if (tab) {
  try {
    Object.assign(ConfStore, JSON.parse(tab))
  } catch (e) {}
}

type ConfSetupProps = {
  file: string
  defaultFile?: string
  defaultConf?: string
  fileExt: string
  typeFlag: AllAppModule
  showCommond?: boolean
}

export const ConfSetup = (props: ComputedRef<ConfSetupProps>) => {
  const config = ref('')
  const input = ref()
  const index = ref(1)
  const changed = ref(false)
  let monacoInstance: editor.IStandaloneCodeEditor | null

  const type = computed({
    get(): 'default' | 'common' {
      if (props?.value?.showCommond === false) {
        return 'default'
      }
      const flag: AllAppModule = props.value.typeFlag as any
      return ConfStore.types?.[flag] ?? 'default'
    },
    set(v: 'default' | 'common') {
      const flag: AllAppModule = props.value.typeFlag as any
      ConfStore.types[flag] = v
    }
  })

  const disabled = computed(() => {
    if (!index.value) {
      return true
    }
    console.log('disabled: ', props?.value?.file, existsSync(props.value.file))
    return !props?.value?.file || !existsSync(props.value.file)
  })

  const defaultDisabled = computed(() => {
    if (!index.value) {
      return true
    }
    return (
      (!props?.value?.defaultFile || !existsSync(props.value.defaultFile)) &&
      !props?.value.defaultConf
    )
  })

  const saveConfig = () => {
    if (disabled?.value) {
      return
    }
    const content = monacoInstance?.getValue() ?? ''
    writeFile(props.value.file, content)
      .then(() => {
        config.value = content
        changed.value = false
        MessageSuccess(I18nT('base.success'))
      })
      .catch(() => {
        IPC.send('app-fork:tools', 'writeFileAndChmod777ByRoot', props.value.file, content).then(
          (key: string, res: any) => {
            IPC.off(key)
            if (res?.code === 0) {
              MessageSuccess(I18nT('base.success'))
              return
            }
            MessageError(res?.msg ?? I18nT('base.fail'))
          }
        )
      })
  }

  const getEditValue = () => {
    if (disabled.value) {
      return ''
    }
    return monacoInstance?.getValue() ?? config?.value ?? ''
  }

  const setEditValue = (v: string) => {
    monacoInstance?.setValue(v)
  }

  const saveCustom = () => {
    const opt = ['showHiddenFiles', 'createDirectory', 'showOverwriteConfirmation']
    dialog
      .showSaveDialog({
        properties: opt,
        defaultPath: 'apache-custom.conf',
        filters: [
          {
            extensions: [props?.value?.fileExt ?? 'conf']
          }
        ]
      })
      .then(({ canceled, filePath }: any) => {
        if (canceled || !filePath) {
          return
        }
        const content = monacoInstance?.getValue() ?? ''
        writeFile(filePath, content).then(() => {
          MessageSuccess(I18nT('base.success'))
        })
      })
  }

  const initEditor = () => {
    if (!monacoInstance) {
      const inputDom: HTMLElement = input?.value as any
      if (!inputDom || !inputDom?.style) {
        return
      }
      monacoInstance = EditorCreate(inputDom, EditorConfigMake(config.value, disabled.value, 'off'))
      monacoInstance.addAction({
        id: 'save',
        label: 'save',
        keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
        run: () => {
          saveConfig()
        }
      })
      monacoInstance.onDidChangeModelContent(() => {
        if (!monacoInstance) {
          return
        }
        const currentValue = monacoInstance?.getValue()
        changed.value = currentValue !== config.value
      })
    } else {
      monacoInstance.setValue(config.value)
      monacoInstance.updateOptions({
        readOnly: disabled.value
      })
    }
  }

  const openConfig = () => {
    if (disabled?.value) {
      return
    }
    shell.showItemInFolder(props.value.file)
  }

  const getConfig = () => {
    console.log('getConfig: ', disabled.value)
    if (disabled.value) {
      config.value = I18nT('base.configNoFound')
      initEditor()
      return
    }
    readFile(props.value.file, 'utf-8')
      .then((conf: string) => {
        config.value = conf
        initEditor()
      })
      .catch(() => {
        IPC.send('app-fork:tools', 'readFileAndChmod777ByRoot', props.value.file).then(
          (key: string, res: any) => {
            IPC.off(key)
            if (res?.code === 0) {
              config.value = res?.data ?? ''
              initEditor()
              return
            }
            config.value = ''
            initEditor()
            MessageError(res?.msg ?? I18nT('base.fail'))
          }
        )
      })
  }

  const getDefault = () => {
    if (defaultDisabled.value) {
      MessageError(I18nT('base.needSelectVersion'))
      return
    }
    if (props?.value?.defaultConf) {
      config.value = props.value.defaultConf
      initEditor()
      return
    }
    readFile(props.value.defaultFile, 'utf-8').then((conf: string) => {
      config.value = conf
      initEditor()
    })
  }

  const loadCustom = () => {
    const opt = ['openFile', 'showHiddenFiles']
    dialog
      .showOpenDialog({
        properties: opt
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const file = filePaths[0]
        const state = statSync(file)
        if (state.size > 5 * 1024 * 1024) {
          MessageError(I18nT('base.fileBigErr'))
          return
        }
        readFile(file, 'utf-8').then((conf: string) => {
          config.value = conf
          initEditor()
        })
      })
  }

  const openURL = (url: string) => {
    shell.openExternal(url)
  }

  watch(disabled, (v) => {
    nextTick().then(() => {
      console.log('watch(disabled !!!', v)
      getConfig()
    })
  })

  watch(type, () => {
    ConfStore.save()
  })

  onMounted(() => {
    nextTick().then(() => {
      getConfig()
    })
  })

  onUnmounted(() => {
    monacoInstance && monacoInstance.dispose()
    monacoInstance = null
  })

  const update = () => {
    index.value += 1
  }

  return {
    changed,
    update,
    config,
    input,
    type,
    disabled,
    defaultDisabled,
    saveCustom,
    openConfig,
    getDefault,
    saveConfig,
    loadCustom,
    getConfig,
    getEditValue,
    setEditValue,
    openURL
  }
}
