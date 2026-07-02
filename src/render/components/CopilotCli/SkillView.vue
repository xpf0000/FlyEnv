<template>
  <el-drawer
    v-model="show"
    :with-header="false"
    size="80%"
    :destroy-on-close="true"
    :close-on-click-modal="false"
    class="host-edit-drawer"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav px-3 pr-5 overflow-hidden flex items-center">
        <div class="flex flex-s items-center gap-3">
          <yb-icon
            :svg="import('@/svg/delete.svg?raw')"
            class="w-[24px] h-[24px] p-[3px] cursor-pointer hover:text-yellow-500"
            @click="show = false"
          />
          <span class="truncate">{{ props.skill.name }}</span>
        </div>
        <div class="flex-shrink-0 flex items-center gap-2">
          <div
            :class="{
              'hover:bg-gray-200': tab !== 'code',
              'bg-gray-300': tab === 'code'
            }"
            class="w-[28px] h-[28px] rounded-[4px] flex items-center justify-center"
            @click.stop="tab = 'code'"
          >
            <yb-icon
              :svg="import('@/svg/markdown-left.svg?raw')"
              class="w-[22px] h-[22px] p-[2px] cursor-pointer hover:text-yellow-500"
            />
          </div>
          <div
            :class="{
              'hover:bg-gray-200': tab !== 'both',
              'bg-gray-300': tab === 'both'
            }"
            class="w-[28px] h-[28px] rounded-[4px] flex items-center justify-center"
            @click.stop="tab = 'both'"
          >
            <yb-icon
              :svg="import('@/svg/markdown-center.svg?raw')"
              :raw-color="true"
              class="w-[28px] h-[28px] p-[2px] cursor-pointer hover:text-yellow-500"
            />
          </div>
          <div
            :class="{
              'hover:bg-gray-200': tab !== 'preview',
              'bg-gray-300': tab === 'preview'
            }"
            class="w-[28px] h-[28px] rounded-[4px] flex items-center justify-center"
            @click.stop="tab = 'preview'"
          >
            <Picture class="w-[23px] h-[23px] p-[2px] cursor-pointer hover:text-yellow-500" />
          </div>
          <div
            class="w-[28px] h-[28px] ml-3 rounded-[4px] flex items-center justify-center hover:bg-gray-200"
            @click.stop="doSave"
          >
            <el-badge is-dot :offset="[-3, 5]" :hidden="!hasChanged">
              <yb-icon
                :svg="import('@/svg/save.svg?raw')"
                :raw-color="true"
                :class="{ 'opacity-50': !canSave }"
                class="w-[23px] h-[23px] p-[2px] cursor-pointer hover:text-yellow-500"
              />
            </el-badge>
          </div>
        </div>
      </div>

      <div ref="mainRef" class="skill-view-content flex-1 overflow-hidden flex">
        <div v-show="tab !== 'preview'" class="left" :style="leftStyle">
          <div ref="editorRef" class="editor"></div>
        </div>
        <div v-show="tab === 'both'" class="handle" @mousedown.stop="handleMoveMouseDown"></div>
        <div
          v-show="tab !== 'code'"
          class="flex-1 h-full overflow-hidden bg-white dark:bg-slate-900 rounded-md"
        >
          <el-scrollbar class="p-5">
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="vp-doc select-text pointer-events-auto" v-html="html"></div>
          </el-scrollbar>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
  import { editor, KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { Picture } from '@element-plus/icons-vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { EditorConfigMake, EditorCreate, EditorDestroy } from '@/util/Editor'
  import { fs, md } from '@/util/NodeFn'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { I18nT } from '@lang/index'
  import { CopilotCliSetup, type SkillItem } from './setup'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    skill: SkillItem
  }>()

  const tab = computed({
    get() {
      return CopilotCliSetup.skillViewTab
    },
    set(value) {
      CopilotCliSetup.skillViewTab = value
    }
  })

  const canSave = ref(false)
  const content = ref('')
  const contentBackup = ref('')
  const html = ref('')

  const editorRef = ref<HTMLElement>()
  const mainRef = ref<HTMLElement>()
  const leftStyle = ref({
    width: '50%',
    flex: 'unset'
  })

  let monacoEditor: editor.IStandaloneCodeEditor | undefined

  const hasChanged = computed(() => {
    return canSave.value && content.value !== contentBackup.value
  })

  watch(
    tab,
    (value) => {
      leftStyle.value.width = value === 'code' ? '100%' : '50%'
    },
    {
      immediate: true
    }
  )

  watch(content, async () => {
    html.value = content.value ? await md.render(content.value) : ''
  })

  const initEditor = async () => {
    if (!editorRef.value) return
    const config = await EditorConfigMake(content.value, !canSave.value, 'on', 'markdown')
    monacoEditor = EditorCreate(editorRef.value, config)
    monacoEditor?.addAction({
      id: 'save',
      label: 'save',
      keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
      run: () => doSave()
    })
    monacoEditor?.onDidChangeModelContent(() => {
      content.value = monacoEditor?.getValue() ?? ''
    })
  }

  const filePath = props.skill.path

  onMounted(async () => {
    try {
      const exists = await fs.existsSync(filePath)
      if (!exists) {
        content.value = `# ${I18nT('common.skills.skillFileMissing')}`
        canSave.value = false
      } else {
        const fileContent = await fs.readFile(filePath)
        const readable = await fs.access(filePath, 'r')
        const writable = await fs.access(filePath, 'w')
        if (!readable && !fileContent) {
          content.value = `# ${I18nT('common.skills.skillLoadFailed')}`
          canSave.value = false
        } else {
          content.value = fileContent
          canSave.value = writable
        }
      }
    } catch {
      content.value = `# ${I18nT('common.skills.skillLoadFailed')}`
      canSave.value = false
    }

    contentBackup.value = content.value
    await nextTick()
    await initEditor()
  })

  onUnmounted(() => {
    EditorDestroy(monacoEditor)
  })

  let wrapperRect: DOMRect = new DOMRect()
  const maskDom = document.createElement('div')
  maskDom.classList.add('app-move-mask')

  const mouseMove = (event: MouseEvent) => {
    event?.stopPropagation?.()
    event?.preventDefault?.()
    const left = event.clientX - wrapperRect.left - 5
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

  const handleMoveMouseDown = (event: MouseEvent) => {
    event?.stopPropagation?.()
    event?.preventDefault?.()
    const mainDom: HTMLElement = mainRef.value as HTMLElement
    wrapperRect = mainDom.getBoundingClientRect()
    document.body.append(maskDom)
    document.addEventListener('mousemove', mouseMove)
    document.addEventListener('mouseup', mouseUp)
  }

  const doSave = async () => {
    if (!canSave.value || !hasChanged.value) return
    const nextContent = monacoEditor?.getValue() ?? content.value
    try {
      await fs.writeFile(filePath, nextContent)
      content.value = nextContent
      contentBackup.value = nextContent
      MessageSuccess(I18nT('base.success'))
    } catch (error) {
      MessageError(`${error}`)
    }
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>

<style scoped>
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
</style>
