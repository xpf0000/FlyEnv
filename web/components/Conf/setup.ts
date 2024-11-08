import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch, ComputedRef } from 'vue'
import { editor, KeyMod, KeyCode } from 'monaco-editor/esm/vs/editor/editor.api.js'
import { EditorConfigMake, EditorCreate } from '@web/fn'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'
import type { AllAppModule } from '@web/core/type'

type CommonSetItemOption = {
  label: string
  value: string
}

export type CommonSetItem = {
  name: string
  value: string
  enable: boolean
  show?: boolean
  options?: CommonSetItemOption[]
  tips: () => string
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
  conf: string
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
    return !props.value.conf
  })

  const defaultDisabled = computed(() => {
    if (!index.value) {
      return true
    }
    return !props.value.conf
  })

  const saveConfig = () => {
    if (disabled?.value) {
      return
    }
    const content = monacoInstance?.getValue() ?? ''
    config.value = content
    changed.value = false
    MessageSuccess(I18nT('base.success'))
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

  const saveCustom = () => {}

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
  }

  const getConfig = () => {
    console.log('getConfig: ', disabled.value)
    if (disabled.value) {
      config.value = I18nT('base.configNoFound')
      initEditor()
      return
    }
    config.value = props.value.conf
    initEditor()
  }

  const getDefault = () => {
    if (defaultDisabled.value) {
      MessageError(I18nT('base.needSelectVersion'))
      return
    }
    config.value = props.value.conf
    initEditor()
  }

  const loadCustom = () => {}

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
    setEditValue
  }
}
