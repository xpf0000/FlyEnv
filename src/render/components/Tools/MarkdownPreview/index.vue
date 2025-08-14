<template>
  <div class="json-parse tools host-edit">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ $t('tools.MarkdownPreview') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="main-wapper overflow-hidden">
      <el-tabs
        v-model="MarkdownPreview.currentTab"
        :editable="true"
        type="card"
        @edit="handleTabsEdit"
      >
        <template v-for="(_, key) in MarkdownPreview.tabs" :key="key">
          <el-tab-pane :label="key" :name="key" :class="key" :closable="key !== 'tab-1'">
          </el-tab-pane>
        </template>
      </el-tabs>
      <div ref="mainRef" class="main pb-0 pt-3">
        <div class="left gap-3" :style="leftStyle">
          <div class="flex">
            <el-button size="small" :icon="Document" @click.stop="openFile"></el-button>
          </div>
          <div ref="fromRef" class="editor el-input__wrapper"></div>
        </div>
        <div ref="moveRef" class="handle" @mousedown.stop="HandleMoveMouseDown"></div>
        <div class="right gap-3 overflow-hidden">
          <span class="flex-shrink-0">{{ I18nT('tools.MarkdownPreview') }}</span>
          <div class="flex-1 overflow-hidden bg-white dark:bg-slate-900 rounded-md">
            <el-scrollbar class="p-3">
              <div class="vp-doc select-text pointer-events-auto" v-html="currentHTML"></div>
            </el-scrollbar>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    onUnmounted,
    reactive,
    ref,
    watch
  } from 'vue'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { AppStore } from '@/store/app'
  import MarkdownPreview, { MarkdownPreviewTab } from './setup'
  import type { TabPaneName } from 'element-plus'
  import { Document } from '@element-plus/icons-vue'
  import { EditorCreate, EditorDestroy } from '@/util/Editor'
  import { dialog, nativeTheme, fs } from '@/util/NodeFn'
  import { unUseCopyCode, useCopyCode } from '@/util/markdown/copyCode'
  import { I18nT } from '@lang/index'

  MarkdownPreview.init()

  const moveRef = ref()
  const fromRef = ref()
  const mainRef = ref()

  const currentMD = computed({
    get() {
      return MarkdownPreview.tabs[MarkdownPreview.currentTab].md
    },
    set(v) {
      MarkdownPreview.tabs[MarkdownPreview.currentTab].md = v
    }
  })

  const currentHTML = computed(() => {
    return MarkdownPreview.tabs[MarkdownPreview.currentTab].html
  })

  const currentTab = computed(() => {
    return MarkdownPreview.tabs[MarkdownPreview.currentTab]
  })

  const handleTabsEdit = (targetName: TabPaneName | undefined, action: 'remove' | 'add') => {
    if (action === 'add') {
      MarkdownPreview.index += 1
      const tabName = `tab-${MarkdownPreview.index}`
      const tab = reactive(new MarkdownPreviewTab())
      tab.destroy = tab.destroy.bind(tab)
      tab.initWatch = tab.initWatch.bind(tab)
      tab.initWatch()
      MarkdownPreview.tabs[tabName] = tab
      MarkdownPreview.currentTab = tabName
    } else if (action === 'remove') {
      if (targetName === 'tab-1') {
        return
      }
      const allKeys = Object.keys(MarkdownPreview.tabs)
      const index = allKeys.findIndex((k) => k === targetName)
      MarkdownPreview.tabs?.[targetName!]?.destroy?.()
      delete MarkdownPreview.tabs?.[targetName!]
      if (targetName === MarkdownPreview.currentTab) {
        MarkdownPreview.currentTab = allKeys[index - 1]
      }
      MarkdownPreview.save()
    }
  }

  let tabChanging = false

  let fromEditor: editor.IStandaloneCodeEditor | undefined

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
      fromEditor = EditorCreate(fromRef.value, await EditorConfigMake(currentMD.value))
      fromEditor?.onDidChangeModelContent?.(() => {
        if (!tabChanging) {
          currentMD.value = fromEditor?.getValue() ?? ''
        }
      })
      const model = fromEditor!.getModel()!
      editor.setModelLanguage(model, 'markdown')
    }
  }

  const handleMoving = ref(false)
  let wapperRect: DOMRect = new DOMRect()
  const leftStyle = computed({
    get() {
      return MarkdownPreview.style
    },
    set(v) {
      MarkdownPreview.style = v
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
    localStorage.setItem('FlyEnv-MarkdownPreview-LeftStyle', JSON.stringify(leftStyle.value))
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
    const opt = ['openFile']
    const filters = [
      {
        name: 'Parse File',
        extensions: ['md', 'MD']
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
        currentMD.value = await fs.readFile(path)
        fromEditor?.setValue(currentMD.value)
      })
  }

  onMounted(() => {
    useCopyCode(mainRef.value)
    initFromEditor()
  })

  onBeforeUnmount(() => {
    unUseCopyCode(mainRef.value)
  })

  onUnmounted(() => {
    EditorDestroy(fromEditor)
  })

  watch(
    () => MarkdownPreview.currentTab,
    () => {
      tabChanging = true
      fromEditor?.setValue(currentMD.value)
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
      if (!currentTab.value.initFN) {
        currentTab.value.initFN = () => {}
        fromEditor?.setValue?.(currentMD.value ?? '')
      }
      clearTimeout(timer)
      timer = setTimeout(() => {
        MarkdownPreview.save()
      }, 600)
    },
    {
      deep: true,
      immediate: true
    }
  )
</script>
