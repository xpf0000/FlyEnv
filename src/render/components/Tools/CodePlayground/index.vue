<template>
  <div class="json-parse tools host-edit">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ $t('tools.CodePlayGround') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="main-wapper">
      <el-tabs v-model="CodePlay.currentTab" :editable="true" type="card" @edit="handleTabsEdit">
        <template v-for="(_, key) in CodePlay.tabs" :key="key">
          <el-tab-pane :label="key" :name="key" :class="key" :closable="key !== 'tab-1'">
          </el-tab-pane>
        </template>
      </el-tabs>
      <div ref="mainRef" class="main pb-0 pt-3">
        <div class="left" :style="leftStyle">
          <div class="flex h-[36px]">
            <el-select v-model="fromType" size="small" class="max-w-[140px]">
              <template v-for="(item, _index) in langs" :key="_index">
                <el-option :label="item" :value="item"></el-option>
              </template>
            </el-select>
            <el-select v-model="fromPath" size="small" style="margin-left: 8px">
              <template v-for="(item, _index) in langsBin" :key="_index">
                <el-option-group :label="item.label">
                  <template v-for="(s, _j) in item.children" :key="_j">
                    <el-option
                      :label="`${item.label}-${s.version}-${s.bin}`"
                      :value="s.path"
                    ></el-option>
                  </template>
                </el-option-group>
              </template>
            </el-select>
            <el-button
              size="small"
              class="ml-4"
              :icon="Document"
              @click.stop="openFile"
            ></el-button>
            <el-button
              size="small"
              style="margin-left: 8px"
              :icon="VideoPlay"
              :loading="execing"
              :disabled="runDisabled"
              @click.stop="doRun"
            ></el-button>
          </div>
          <div ref="fromRef" class="editor el-input__wrapper"></div>
        </div>
        <div ref="moveRef" class="handle" @mousedown.stop="HandleMoveMouseDown"></div>
        <div class="right">
          <div class="flex h-[36px] gap-2">
            <el-select
              v-model="to"
              class="max-w-[140px]"
              size="small"
              filterable
              @change="onToChange"
            >
              <el-option label="Raw" value="raw"></el-option>
              <el-option label="JSON" value="json"></el-option>
              <el-option label="JSON Minify" value="json-minify"></el-option>
              <el-option label="PHP Array" value="php"></el-option>
              <el-option label="JavaScript" value="js"></el-option>
              <el-option label="TypeScript" value="ts"></el-option>
              <el-option label="YAML" value="yaml"></el-option>
              <el-option label="XML" value="xml"></el-option>
              <el-option label="PList" value="plist"></el-option>
              <el-option label="TOML" value="toml"></el-option>
              <el-option label="Go Struct" value="goStruct"></el-option>
              <el-option label="Go Bson" value="goBson"></el-option>
              <el-option label="Rust Serde" value="rustSerde"></el-option>
              <el-option label="Java" value="Java"></el-option>
              <el-option label="Kotlin" value="Kotlin"></el-option>
              <el-option label="MySQL" value="MySQL"></el-option>
              <el-option label="JSDoc" value="JSDoc"></el-option>
            </el-select>
            <el-button-group size="small">
              <el-button size="small" @click.stop="saveToLocal">
                <yb-icon :svg="import('@/svg/save.svg?raw')" width="14" height="14" />
              </el-button>
            </el-button-group>
          </div>
          <div ref="toRef" class="editor el-input__wrapper"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
  import { editor, languages } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import TomlRules from '@/util/transform/TomlRules'
  import { AppStore } from '@/store/app'
  import CodePlay, { CodePlayTab } from '@/components/Tools/CodePlayground/setup'
  import type { TabPaneName } from 'element-plus'
  import { Document, VideoPlay } from '@element-plus/icons-vue'
  import { EditorCreate, EditorDestroy } from '@/util/Editor'
  import { dialog, nativeTheme, fs } from '@/util/NodeFn'
  import { BrewStore } from '@/store/brew'
  import { languagesToCheck } from '@/components/Tools/CodePlayground/languageDetector'
  import { AsyncComponentShow } from '@/util/AsyncComponent'

  CodePlay.init()

  // Register custom language
  languages.register({ id: 'toml' })
  // Provide basic tokens for the custom language
  languages.setMonarchTokensProvider('toml', TomlRules as any)

  const moveRef = ref()
  const fromRef = ref()
  const toRef = ref()
  const mainRef = ref()

  const brewStore = BrewStore()

  const langs = computed(() => {
    return [...languagesToCheck].sort()
  })

  const langsBin = computed(() => {
    const bins = [
      {
        label: 'Python',
        type: 'python',
        children: brewStore.module('python').installed
      },
      {
        label: 'PHP',
        type: 'php',
        children: brewStore.module('php').installed
      },
      {
        label: 'NodeJS',
        type: 'node',
        children: brewStore.module('node').installed
      },
      {
        label: 'Bun',
        type: 'bun',
        children: brewStore.module('bun').installed
      },
      {
        label: 'Deno',
        type: 'deno',
        children: brewStore.module('deno').installed
      },
      {
        label: 'Go',
        type: 'golang',
        children: brewStore.module('golang').installed
      },
      {
        label: 'Rust',
        type: 'rust',
        children: brewStore.module('rust').installed
      },
      {
        label: 'Java',
        type: 'java',
        children: brewStore.module('java').installed
      },
      {
        label: 'Perl',
        type: 'perl',
        children: brewStore.module('perl').installed
      },
      {
        label: 'Ruby',
        type: 'ruby',
        children: brewStore.module('ruby').installed
      },
      {
        label: 'Erlang',
        type: 'erlang',
        children: brewStore.module('erlang').installed
      }
    ].sort((a, b) => a.label.localeCompare(b.label))

    const type = currentTab.value.fromType
    if (['javascript', 'typescript'].includes(type)) {
      return bins.filter((b) => ['node', 'bun', 'deno'].includes(b.type))
    }
    return bins.filter((b) => b.type === type)
  })

  const fromType = computed({
    get() {
      console.log('CodePlay: ', CodePlay)
      return CodePlay.tabs[CodePlay.currentTab].fromType
    },
    set(v: string) {
      CodePlay.tabs[CodePlay.currentTab].fromType = v
    }
  })

  const fromPath = computed({
    get() {
      console.log('CodePlay: ', CodePlay)
      return CodePlay.tabs[CodePlay.currentTab].fromPath
    },
    set(v: string) {
      console.log('fromPath set: ', v)
      CodePlay.tabs[CodePlay.currentTab].fromPath = v
    }
  })

  const runDisabled = computed(() => {
    return execing.value || !fromType.value || !fromPath.value || !currentValue.value.trim()
  })

  const to = computed({
    get() {
      console.log('CodePlay: ', CodePlay)
      return CodePlay.tabs[CodePlay.currentTab].to
    },
    set(v: string) {
      CodePlay.tabs[CodePlay.currentTab].to = v
    }
  })

  const currentValue = computed({
    get() {
      return CodePlay.tabs[CodePlay.currentTab].value
    },
    set(v) {
      CodePlay.tabs[CodePlay.currentTab].value = v
    }
  })
  const currentToValue = computed({
    get() {
      return CodePlay.tabs[CodePlay.currentTab].toValue
    },
    set(v) {
      CodePlay.tabs[CodePlay.currentTab].toValue = v
    }
  })

  const currentToLang = computed({
    get() {
      return CodePlay.tabs[CodePlay.currentTab].toLang
    },
    set(v) {
      CodePlay.tabs[CodePlay.currentTab].toLang = v
    }
  })

  const currentTab = computed(() => {
    return CodePlay.tabs[CodePlay.currentTab]
  })

  const handleTabsEdit = (targetName: TabPaneName | undefined, action: 'remove' | 'add') => {
    if (action === 'add') {
      CodePlay.index += 1
      const tabName = `tab-${CodePlay.index}`
      const tab = reactive(new CodePlayTab())
      tab.editor = () => toEditor!
      tab.destroy = tab.destroy.bind(tab)
      tab.initWatch = tab.initWatch.bind(tab)
      tab.initWatch()
      CodePlay.tabs[tabName] = tab
      CodePlay.currentTab = tabName
    } else if (action === 'remove') {
      if (targetName === 'tab-1') {
        return
      }
      const allKeys = Object.keys(CodePlay.tabs)
      const index = allKeys.findIndex((k) => k === targetName)
      CodePlay.tabs?.[targetName!]?.destroy?.()
      delete CodePlay.tabs?.[targetName!]
      if (targetName === CodePlay.currentTab) {
        CodePlay.currentTab = allKeys[index - 1]
      }
      CodePlay.save()
    }
  }

  let tabChanging = false

  let fromEditor: editor.IStandaloneCodeEditor | undefined
  let toEditor: editor.IStandaloneCodeEditor | undefined

  const EditorConfigMake = async (
    value: string
  ): Promise<editor.IStandaloneEditorConstructionOptions> => {
    const appStore = AppStore()
    const editorConfig = appStore.editorConfig
    let theme = editorConfig.theme
    if (theme === 'auto') {
      let appTheme = appStore?.config?.setup?.theme ?? ''
      if (!appTheme || appTheme === 'system') {
        const t = await nativeTheme.shouldUseDarkColors()
        appTheme = t ? 'dark' : 'light'
      }
      if (appTheme === 'light') {
        theme = 'vs-light'
      } else {
        theme = 'vs-dark'
      }
    }
    return {
      value,
      language: 'javascript',
      scrollBeyondLastLine: false,
      overviewRulerBorder: true,
      automaticLayout: true,
      wordWrap: 'on',
      theme: theme,
      fontSize: editorConfig.fontSize,
      lineHeight: editorConfig.lineHeight,
      lineNumbersMinChars: 2,
      folding: true,
      showFoldingControls: 'always',
      foldingStrategy: 'indentation',
      foldingImportsByDefault: true,
      formatOnPaste: true,
      formatOnType: true
    }
  }

  const initFromEditor = async () => {
    if (!fromEditor) {
      if (!fromRef?.value?.style) {
        return
      }
      fromEditor = EditorCreate(fromRef.value, await EditorConfigMake(currentValue.value))
      fromEditor?.onDidChangeModelContent?.(() => {
        if (!tabChanging) {
          currentValue.value = fromEditor?.getValue() ?? ''
          // currentTab.value.checkFrom().catch()
        }
      })
    }
  }

  const initToEditor = async () => {
    if (!toEditor) {
      if (!toRef?.value?.style) {
        return
      }
      toEditor = EditorCreate(toRef.value, await EditorConfigMake(currentToValue.value))
      toEditor?.onDidChangeModelContent?.(() => {
        if (!tabChanging) {
          currentToValue.value = toEditor?.getValue() ?? ''
        }
      })
      currentTab.value.editor = () => toEditor!
      console.log('actions: ', toEditor?.getSupportedActions())
    }
  }

  const handleMoving = ref(false)
  let wapperRect: DOMRect = new DOMRect()
  const leftStyle = computed({
    get() {
      return CodePlay.style
    },
    set(v) {
      CodePlay.style = v
    }
  })

  const maskDom = document.createElement('div')
  maskDom.classList.add('app-move-mask')

  const mouseMove = (e: MouseEvent) => {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    const left = e.clientX - wapperRect.left - 5
    leftStyle.value = {
      width: `${left}px`,
      flex: 'unset'
    }
  }
  const mouseUp = () => {
    document.removeEventListener('mousemove', mouseMove)
    document.removeEventListener('mouseup', mouseUp)
    maskDom.remove()
    handleMoving.value = false
    localStorage.setItem('FlyEnv-CodePlay-LeftStyle', JSON.stringify(leftStyle.value))
  }
  const HandleMoveMouseDown = (e: MouseEvent) => {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    handleMoving.value = true
    const mainDom: HTMLElement = mainRef.value as any
    wapperRect = mainDom.getBoundingClientRect()
    document.body.append(maskDom)
    document.addEventListener('mousemove', mouseMove)
    document.addEventListener('mouseup', mouseUp)
  }

  const openFile = () => {
    const extensionMap: Record<string, string> = {
      py: 'python',
      php: 'php',
      js: 'node',
      mjs: 'node',
      cjs: 'node',
      ts: 'typescript',
      tsx: 'typescript',
      go: 'golang',
      rs: 'rust',
      java: 'java',
      pl: 'perl',
      rb: 'ruby',
      erl: 'erlang'
    }
    const opt = ['openFile']
    const filters = [
      {
        name: 'Parse File',
        extensions: Object.keys(extensionMap)
      }
    ]
    dialog
      .showOpenDialog({
        properties: opt,
        filters: filters
      })
      .then(async ({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        currentValue.value = await fs.readFile(path)
        fromEditor?.setValue(currentValue.value)
      })
  }

  const execing = computed(() => {
    return CodePlay.tabs[CodePlay.currentTab].execing
  })

  const doRun = () => {
    currentTab.value.run()
  }

  let CodeAddVM: any
  import('@/components/Tools/CodeLibrary/codeAdd.vue').then((res) => {
    CodeAddVM = res.default
  })

  const saveToLocal = () => {
    AsyncComponentShow(CodeAddVM, {
      langType: currentTab.value.fromType,
      item: {
        value: currentTab.value.value,
        toValue: currentTab.value.toValue
      }
    }).then()
  }

  onMounted(() => {
    initFromEditor()
    initToEditor()
  })

  onUnmounted(() => {
    EditorDestroy(fromEditor)
    EditorDestroy(toEditor)
  })

  const onToChange = (v: any) => {
    console.log('onToChange !!!', v)
    if (!tabChanging) {
      currentTab.value.transformTo()
    }
  }

  watch(
    () => CodePlay.currentTab,
    () => {
      tabChanging = true
      currentTab.value.editor = () => toEditor!
      fromEditor?.setValue(currentValue.value)
      toEditor?.setValue(currentToValue.value)
      const model = toEditor!.getModel()!
      editor.setModelLanguage(model, currentToLang.value)
      nextTick().then(() => {
        tabChanging = false
      })
    }
  )

  let timer: any
  watch(
    currentTab,
    (v) => {
      if (!v) {
        return
      }
      if (!currentTab.value.editor && toEditor) {
        currentTab.value.editor = () => toEditor!
        currentTab.value.fromEditor = () => fromEditor!
        currentTab.value.initFromModelLanguage()
        fromEditor?.setValue?.(currentValue.value ?? '')
        currentTab.value.transformTo()
      }
      clearTimeout(timer)
      timer = setTimeout(() => {
        CodePlay.save()
      }, 600)
    },
    {
      deep: true,
      immediate: true
    }
  )
</script>
