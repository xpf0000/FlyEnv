import { computed, ComputedRef, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
import type { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
import { EditorConfigMake, EditorCreate, EditorDestroy } from '@/util/Editor'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import type { AllAppModule } from '@/core/type'
import { dialog, shell, fs } from '@/util/NodeFn'
import { asyncComputed } from '@vueuse/core'
import { BrewStore, SoftInstalled } from '@/store/brew'

type CommonSetItemOption = {
  label: string
  value: string
}

export type CommonSetItem = {
  section?: string
  name: string
  value: string
  enable: boolean
  show?: boolean
  type?: string
  isString?: boolean
  isFile?: boolean
  isDir?: boolean
  showEnable?: boolean
  options?: CommonSetItemOption[]
  tips: () => string
  onChange?: (newValue: any, oldValue: any) => void
  key?: string
  pathHandler?: (dir: string) => string
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
  } catch {
    /* empty */
  }
}

type ConfSetupProps = {
  file: string
  defaultFile?: string
  defaultConf?: string
  fileExt: string
  typeFlag: AllAppModule
  showCommond?: boolean
  version?: SoftInstalled
}

export const ConfSetup = (props: ComputedRef<ConfSetupProps>) => {
  const config = ref('')
  const input = ref()
  const index = ref(1)
  const configIndex = ref(0)
  const changed = ref(false)
  let monacoInstance: editor.IStandaloneCodeEditor | undefined

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

  const disabled = asyncComputed<boolean>(async () => {
    if (!index.value) {
      return true
    }
    const exists = await fs.existsSync(props?.value?.file ?? '')
    return !props?.value?.file || !exists
  })

  const defaultFileExists = ref(false)

  const defaultDisabled = computed(() => {
    if (!index.value) {
      return true
    }
    return (!props?.value?.defaultFile || !defaultFileExists.value) && !props?.value.defaultConf
  })

  watch(
    () => props.value.defaultFile,
    (v) => {
      if (v) {
        fs.existsSync(v).then((e: boolean) => {
          defaultFileExists.value = e
        })
      }
    },
    {
      immediate: true
    }
  )

  let lastSaveTime: number = 0
  let lastRestartTime: number = 0

  const brewStore = BrewStore()
  const module = brewStore.module(props.value.typeFlag)
  const current = props?.value?.version
    ? module.installed.find(
        (f) =>
          f.version === props?.value?.version?.version &&
          (f.phpBin === props?.value?.version?.phpBin || f.bin === props?.value?.version?.bin)
      )
    : brewStore.currentVersion(props.value.typeFlag)
  let timer: any

  const restartService = (chechRun: boolean, retryTimes = 0) => {
    const ServiceRun = chechRun ? (current?.run ?? false) : true
    if (!module.isService || !current || !ServiceRun || current?.running || retryTimes >= 2) {
      return
    }
    clearTimeout(timer)
    setTimeout(() => {
      lastRestartTime = Date.now()
      current
        .restart()
        .then(() => {
          if (lastSaveTime > lastRestartTime) {
            restartService(false, 0)
          }
        })
        .catch(() => {
          restartService(false, retryTimes + 1)
        })
    }, 800)
  }

  const saveConfig = () => {
    if (disabled?.value) {
      return
    }
    const content = monacoInstance?.getValue() ?? ''
    if (config.value === content) {
      return
    }
    fs.writeFile(props.value.file, content).then(() => {
      config.value = content
      changed.value = false
      lastSaveTime = Date.now()
      restartService(true)
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
        fs.writeFile(filePath, content).then(() => {
          MessageSuccess(I18nT('base.success'))
        })
      })
  }

  const initEditor = async () => {
    if (!monacoInstance) {
      const inputDom: HTMLElement = input?.value as any
      if (!inputDom || !inputDom?.style) {
        return
      }
      monacoInstance = EditorCreate(
        inputDom,
        await EditorConfigMake(config.value, disabled?.value ?? true, 'off')
      )
      monacoInstance!.addAction({
        id: 'save',
        label: 'save',
        keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
        run: () => {
          saveConfig()
        }
      })
      monacoInstance!.onDidChangeModelContent(() => {
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
    configIndex.value += 1
  }

  const openConfig = () => {
    if (disabled?.value) {
      return
    }
    shell.showItemInFolder(props.value.file).then().catch()
  }

  const getConfig = () => {
    console.log('getConfig: ', disabled.value)
    if (disabled.value) {
      config.value = I18nT('base.configNotFound')
      initEditor()
      return
    }
    fs.readFile(props.value.file).then((conf: string) => {
      config.value = conf
      initEditor()
    })
  }

  const getDefault = () => {
    if (defaultDisabled.value) {
      MessageError(I18nT('base.needSelectVersion'))
      return
    }
    if (props?.value?.defaultConf) {
      changed.value = props.value.defaultConf !== config.value
      config.value = props.value.defaultConf
      initEditor()
      return
    }
    fs.readFile(props.value.defaultFile).then((conf: string) => {
      console.log('getDefault config.value === conf', config.value === conf)
      changed.value = conf !== config.value
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
      .then(async ({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const file = filePaths[0]
        const state: any = await fs.stat(file)
        if (state.size > 5 * 1024 * 1024) {
          MessageError(I18nT('base.fileBigErr'))
          return
        }
        fs.readFile(file).then((conf: string) => {
          changed.value = conf !== config.value
          config.value = conf
          initEditor()
        })
      })
  }

  const openURL = (url: string) => {
    shell.openExternal(url).then().catch()
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
    EditorDestroy(monacoInstance)
  })

  const update = () => {
    index.value += 1
  }

  const watchFlag = computed(() => {
    return `${type.value}-${disabled.value}-${configIndex.value}`
  })

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
    openURL,
    watchFlag
  }
}
