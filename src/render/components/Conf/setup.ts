import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch, ComputedRef } from 'vue'
import { editor, KeyMod, KeyCode } from 'monaco-editor/esm/vs/editor/editor.api.js'
import { EditorConfigMake, EditorCreate } from '@/util/Editor'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'
import type { AllAppModule } from '@/core/type'

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
  options?: CommonSetItemOption[]
  tips: () => string
}

type ConfStoreType = {
  types: Record<AllAppModule, 'default' | 'common'>
  save: () => void
}

const ConfStore: ConfStoreType = reactive({
  types: {},
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
  defaultFile: string
  fileExt: string
  typeFlag: AllAppModule
}

export const ConfSetup = (props: ComputedRef<ConfSetupProps>) => {
  const config = ref('')
  const input = ref()
  let monacoInstance: editor.IStandaloneCodeEditor | null

  const type = computed({
    get(): 'default' | 'common' {
      const flag: AllAppModule = props.value.typeFlag as any
      return ConfStore.types?.[flag] ?? 'default'
    },
    set(v: 'default' | 'common') {
      const flag: AllAppModule = props.value.typeFlag as any
      ConfStore.types[flag] = v
    }
  })

  const disabled = computed(() => {
    console.log('disabled: ', props?.value?.file, existsSync(props.value.file))
    return !props?.value?.file || !existsSync(props.value.file)
  })

  const defaultDisabled = computed(() => {
    return !props?.value?.defaultFile || !existsSync(props.value.defaultFile)
  })

  const saveConfig = () => {
    if (disabled?.value) {
      return
    }
    const content = monacoInstance?.getValue() ?? ''
    writeFile(props.value.file, content).then(() => {
      MessageSuccess(I18nT('base.success'))
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
      MessageError(config.value)
      initEditor()
      return
    }
    readFile(props.value.file, 'utf-8').then((conf: string) => {
      config.value = conf
      initEditor()
    })
  }

  const getDefault = () => {
    if (defaultDisabled.value) {
      MessageError(I18nT('base.needSelectVersion'))
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

  return {
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
    setEditValue
  }
}
