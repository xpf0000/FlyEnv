<template>
  <el-dropdown
    v-model="show"
    :title="title"
    width="80%"
    :destroy-on-close="true"
    :close-on-click-modal="false"
    @closed="closedFn"
  >
    <div ref="mainRef" class="skill-view-content">
      <div class="left" :style="leftStyle">
        <div ref="editorRef" class="editor"></div>
      </div>
      <div class="handle" @mousedown.stop="HandleMoveMouseDown"></div>
      <div class="right overflow-hidden">
        <span class="flex-shrink-0">{{ I18nT('tools.MarkdownPreview') }}</span>
        <div class="flex-1 overflow-hidden bg-white dark:bg-slate-900 rounded-md">
          <el-scrollbar class="p-3">
            <div class="vp-doc select-text pointer-events-auto" v-html="html"></div>
          </el-scrollbar>
        </div>
      </div>
    </div>
  </el-dropdown>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { EditorCreate, EditorDestroy, EditorConfigMake } from '@/util/Editor'
  import { app, fs, md } from '@/util/NodeFn'
  import { I18nT } from '@lang/index'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    category: string
    name: string
  }>()

  const title = computed(() => `${props.category}/${props.name}`)

  const content = ref('')
  const html = ref('')

  const editorRef = ref<HTMLElement>()
  const mainRef = ref<HTMLElement>()
  let monacoEditor: editor.IStandaloneCodeEditor | undefined

  const leftStyle = ref({
    width: '50%',
    flex: 'unset'
  })

  const initEditor = async () => {
    if (!editorRef.value) return
    const config = await EditorConfigMake(content.value, false, 'on', 'markdown')
    monacoEditor = EditorCreate(editorRef.value, config)
    monacoEditor?.onDidChangeModelContent(() => {
      content.value = monacoEditor?.getValue() ?? ''
    })
  }

  const renderHtml = async () => {
    if (!content.value) {
      html.value = ''
      return
    }
    html.value = await md.render(content.value)
  }

  watch(content, () => {
    renderHtml()
  })

  onMounted(async () => {
    try {
      const home = await app.getPath('home')
      const path = `${home}/.hermes/skills/${props.category}/${props.name}/SKILL.md`
      const exists = await fs.existsSync(path)
      if (exists) {
        content.value = await fs.readFile(path)
      } else {
        content.value = '# SKILL.md not found'
      }
    } catch {
      content.value = '# Error loading file'
    }
    await nextTick()
    initEditor()
  })

  onUnmounted(() => {
    EditorDestroy(monacoEditor)
  })

  let wapperRect: DOMRect = new DOMRect()
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
  }
  const HandleMoveMouseDown = (e: MouseEvent) => {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    const mainDom: HTMLElement = mainRef.value as any
    wapperRect = mainDom.getBoundingClientRect()
    document.body.append(maskDom)
    document.addEventListener('mousemove', mouseMove)
    document.addEventListener('mouseup', mouseUp)
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>

<style scoped>
  .skill-view-content {
    display: flex;
    height: 60vh;
    overflow: hidden;
  }
  .left {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .editor {
    flex: 1;
    overflow: hidden;
  }
  .handle {
    width: 5px;
    cursor: col-resize;
    background: #ddd;
    flex-shrink: 0;
  }
  .right {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
</style>
