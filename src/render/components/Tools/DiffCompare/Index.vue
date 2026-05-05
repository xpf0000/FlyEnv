<script setup lang="ts">
  import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
  import { editor, Range } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { debounce } from 'lodash-es'
  import { I18nT } from '@lang/index'
  import { EditorConfigMake, EditorCreate, EditorDestroy } from '@/util/Editor'

  type DiffType = 'same' | 'added' | 'removed'

  type DiffSegment = {
    value: string
    changed: boolean
  }

  type DiffLine = {
    type: DiffType
    oldLine: number | ''
    newLine: number | ''
    value: string
    segments?: DiffSegment[]
  }

  type DiffTarget = {
    side: 'original' | 'changed'
    lineNumber: number
  }

  const sampleOriginal = `FlyEnv is an all-in-one local development environment.
It supports PHP, Node.js, databases and more.
JWT and Cron tools are available.`

  const sampleChanged = `FlyEnv is an all-in-one local development environment.
It supports PHP, Node.js, databases, Redis and more.
JWT, Cron and Diff tools are available.`

  const store = reactive({
    original: '',
    changed: '',
    activeDiffIndex: -1
  })

  const originalRef = ref<HTMLElement>()
  const changedRef = ref<HTMLElement>()
  let originalEditor: editor.IStandaloneCodeEditor | undefined
  let changedEditor: editor.IStandaloneCodeEditor | undefined
  let originalDecorations: editor.IEditorDecorationsCollection | undefined
  let changedDecorations: editor.IEditorDecorationsCollection | undefined
  let syncingEditors = false
  let syncingScroll = false

  const splitLines = (value: string) => value.replace(/\r\n/g, '\n').split('\n')

  const pushSegment = (segments: DiffSegment[], value: string, changed: boolean) => {
    const lastSegment = segments[segments.length - 1]
    if (lastSegment?.changed === changed) {
      lastSegment.value += value
      return
    }
    segments.push({ value, changed })
  }

  const buildInlineSegments = (oldValue: string, newValue: string) => {
    const oldChars = Array.from(oldValue)
    const newChars = Array.from(newValue)
    const matrix = Array.from({ length: oldChars.length + 1 }, () =>
      Array.from({ length: newChars.length + 1 }, () => 0)
    )

    for (let oldIndex = oldChars.length - 1; oldIndex >= 0; oldIndex -= 1) {
      for (let newIndex = newChars.length - 1; newIndex >= 0; newIndex -= 1) {
        matrix[oldIndex][newIndex] =
          oldChars[oldIndex] === newChars[newIndex]
            ? matrix[oldIndex + 1][newIndex + 1] + 1
            : Math.max(matrix[oldIndex + 1][newIndex], matrix[oldIndex][newIndex + 1])
      }
    }

    const oldSegments: DiffSegment[] = []
    const newSegments: DiffSegment[] = []
    let oldIndex = 0
    let newIndex = 0

    while (oldIndex < oldChars.length && newIndex < newChars.length) {
      if (oldChars[oldIndex] === newChars[newIndex]) {
        pushSegment(oldSegments, oldChars[oldIndex], false)
        pushSegment(newSegments, newChars[newIndex], false)
        oldIndex += 1
        newIndex += 1
      } else if (matrix[oldIndex + 1][newIndex] >= matrix[oldIndex][newIndex + 1]) {
        pushSegment(oldSegments, oldChars[oldIndex], true)
        oldIndex += 1
      } else {
        pushSegment(newSegments, newChars[newIndex], true)
        newIndex += 1
      }
    }

    while (oldIndex < oldChars.length) {
      pushSegment(oldSegments, oldChars[oldIndex], true)
      oldIndex += 1
    }

    while (newIndex < newChars.length) {
      pushSegment(newSegments, newChars[newIndex], true)
      newIndex += 1
    }

    return { oldSegments, newSegments }
  }

  const buildLineDiff = (oldText: string, newText: string) => {
    const oldLines = splitLines(oldText)
    const newLines = splitLines(newText)
    const matrix = Array.from({ length: oldLines.length + 1 }, () =>
      Array.from({ length: newLines.length + 1 }, () => 0)
    )

    for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
      for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
        matrix[oldIndex][newIndex] =
          oldLines[oldIndex] === newLines[newIndex]
            ? matrix[oldIndex + 1][newIndex + 1] + 1
            : Math.max(matrix[oldIndex + 1][newIndex], matrix[oldIndex][newIndex + 1])
      }
    }

    const rawResult: DiffLine[] = []
    let oldIndex = 0
    let newIndex = 0

    while (oldIndex < oldLines.length && newIndex < newLines.length) {
      if (oldLines[oldIndex] === newLines[newIndex]) {
        rawResult.push({
          type: 'same',
          oldLine: oldIndex + 1,
          newLine: newIndex + 1,
          value: oldLines[oldIndex]
        })
        oldIndex += 1
        newIndex += 1
      } else if (matrix[oldIndex + 1][newIndex] >= matrix[oldIndex][newIndex + 1]) {
        rawResult.push({
          type: 'removed',
          oldLine: oldIndex + 1,
          newLine: '',
          value: oldLines[oldIndex]
        })
        oldIndex += 1
      } else {
        rawResult.push({
          type: 'added',
          oldLine: '',
          newLine: newIndex + 1,
          value: newLines[newIndex]
        })
        newIndex += 1
      }
    }

    while (oldIndex < oldLines.length) {
      rawResult.push({
        type: 'removed',
        oldLine: oldIndex + 1,
        newLine: '',
        value: oldLines[oldIndex]
      })
      oldIndex += 1
    }

    while (newIndex < newLines.length) {
      rawResult.push({
        type: 'added',
        oldLine: '',
        newLine: newIndex + 1,
        value: newLines[newIndex]
      })
      newIndex += 1
    }

    return rawResult
  }

  const pairChangedLines = (lines: DiffLine[]) => {
    const result: DiffLine[] = []
    let index = 0
    while (index < lines.length) {
      const current = lines[index]
      if (current.type !== 'removed') {
        result.push(current)
        index += 1
        continue
      }

      const removedBlock: DiffLine[] = []
      while (index < lines.length && lines[index].type === 'removed') {
        removedBlock.push(lines[index])
        index += 1
      }
      const addedBlock: DiffLine[] = []
      while (index < lines.length && lines[index].type === 'added') {
        addedBlock.push(lines[index])
        index += 1
      }

      if (addedBlock.length === 0) {
        result.push(...removedBlock)
        continue
      }

      const pairCount = Math.min(removedBlock.length, addedBlock.length)
      for (let i = 0; i < pairCount; i++) {
        const { oldSegments, newSegments } = buildInlineSegments(
          removedBlock[i].value,
          addedBlock[i].value
        )
        result.push({ ...removedBlock[i], segments: oldSegments })
        result.push({ ...addedBlock[i], segments: newSegments })
      }
      for (let i = pairCount; i < removedBlock.length; i++) {
        result.push(removedBlock[i])
      }
      for (let i = pairCount; i < addedBlock.length; i++) {
        result.push(addedBlock[i])
      }
    }
    return result
  }

  const diffLines = computed(() => {
    return pairChangedLines(buildLineDiff(store.original, store.changed))
  })

  const diffTargets = computed<DiffTarget[]>(() => {
    return diffLines.value.reduce((targets, line) => {
      if (line.type === 'removed' && line.oldLine !== '') {
        targets.push({ side: 'original', lineNumber: line.oldLine })
      } else if (line.type === 'added' && line.newLine !== '') {
        targets.push({ side: 'changed', lineNumber: line.newLine })
      }
      return targets
    }, [] as DiffTarget[])
  })

  const stats = computed(() => {
    let added = 0
    let removed = 0
    let unchanged = 0
    for (const line of diffLines.value) {
      if (line.type === 'added') added++
      else if (line.type === 'removed') removed++
      else unchanged++
    }
    return { added, removed, changed: Math.max(added, removed), unchanged }
  })

  const editorConfig = async (value: string) => {
    return {
      ...(await EditorConfigMake(value, false, 'on', 'plaintext')),
      minimap: { enabled: false },
      lineNumbersMinChars: 3,
      renderLineHighlight: 'none'
    }
  }

  const clearEditorHighlights = () => {
    originalDecorations?.clear()
    changedDecorations?.clear()
  }

  const addLineDecoration = (
    decorations: editor.IModelDeltaDecoration[],
    lineNumber: number,
    className: string
  ) => {
    decorations.push({
      range: new Range(lineNumber, 1, lineNumber, 1),
      options: {
        isWholeLine: true,
        className
      }
    })
  }

  const addInlineDecorations = (
    decorations: editor.IModelDeltaDecoration[],
    lineNumber: number,
    segments: DiffSegment[] | undefined,
    className: string
  ) => {
    if (!segments?.length) {
      return
    }
    let column = 1
    for (const segment of segments) {
      const length = Array.from(segment.value).length
      if (segment.changed && length > 0) {
        decorations.push({
          range: new Range(lineNumber, column, lineNumber, column + length),
          options: {
            inlineClassName: className
          }
        })
      }
      column += length
    }
  }

  const applyEditorHighlights = () => {
    const originalHighlightDecorations: editor.IModelDeltaDecoration[] = []
    const changedHighlightDecorations: editor.IModelDeltaDecoration[] = []

    for (const line of diffLines.value) {
      if (line.type === 'removed' && line.oldLine !== '') {
        addLineDecoration(originalHighlightDecorations, line.oldLine, 'diff-compare-removed-line')
        addInlineDecorations(
          originalHighlightDecorations,
          line.oldLine,
          line.segments,
          'diff-compare-removed-text'
        )
      } else if (line.type === 'added' && line.newLine !== '') {
        addLineDecoration(changedHighlightDecorations, line.newLine, 'diff-compare-added-line')
        addInlineDecorations(
          changedHighlightDecorations,
          line.newLine,
          line.segments,
          'diff-compare-added-text'
        )
      }
    }

    originalDecorations?.set(originalHighlightDecorations)
    changedDecorations?.set(changedHighlightDecorations)
  }

  const syncEditorValues = () => {
    syncingEditors = true
    originalEditor?.setValue(store.original)
    changedEditor?.setValue(store.changed)
    syncingEditors = false
  }

  const refreshComparisonImmediate = () => {
    clearEditorHighlights()
    applyEditorHighlights()
    if (diffTargets.value.length === 0) {
      store.activeDiffIndex = -1
    } else if (store.activeDiffIndex >= diffTargets.value.length) {
      store.activeDiffIndex = diffTargets.value.length - 1
    }
  }

  const refreshComparison = debounce(refreshComparisonImmediate, 300)

  const goToDiff = (direction: 1 | -1) => {
    if (diffTargets.value.length === 0) {
      return
    }
    const nextIndex =
      store.activeDiffIndex === -1
        ? 0
        : (store.activeDiffIndex + direction + diffTargets.value.length) % diffTargets.value.length
    store.activeDiffIndex = nextIndex
    const target = diffTargets.value[nextIndex]
    const targetEditor = target.side === 'original' ? originalEditor : changedEditor
    targetEditor?.revealLineInCenter(target.lineNumber)
    targetEditor?.setPosition({ lineNumber: target.lineNumber, column: 1 })
    targetEditor?.focus()
  }

  const loadSample = () => {
    store.original = sampleOriginal
    store.changed = sampleChanged
    store.activeDiffIndex = -1
    syncEditorValues()
    refreshComparisonImmediate()
  }

  const syncScroll = (
    sourceEditor: editor.IStandaloneCodeEditor,
    targetEditor: editor.IStandaloneCodeEditor
  ) => {
    if (syncingScroll) {
      return
    }
    syncingScroll = true
    targetEditor.setScrollTop(sourceEditor.getScrollTop())
    targetEditor.setScrollLeft(sourceEditor.getScrollLeft())
    requestAnimationFrame(() => {
      syncingScroll = false
    })
  }

  const swapInputs = () => {
    const original = store.original
    store.original = store.changed
    store.changed = original
    store.activeDiffIndex = -1
    syncEditorValues()
    refreshComparisonImmediate()
  }

  const clearInputs = () => {
    store.original = ''
    store.changed = ''
    store.activeDiffIndex = -1
    syncEditorValues()
    refreshComparisonImmediate()
  }

  const copyDiff = async () => {
    const output = diffLines.value
      .map((line) => {
        if (line.type === 'added') {
          return `+ ${line.value}`
        }
        if (line.type === 'removed') {
          return `- ${line.value}`
        }
        return `  ${line.value}`
      })
      .join('\n')
    await navigator.clipboard.writeText(output)
  }

  const initEditors = async () => {
    await nextTick()
    if (originalRef.value && !originalEditor) {
      originalEditor = EditorCreate(originalRef.value, await editorConfig(store.original))!
      originalDecorations = originalEditor.createDecorationsCollection()
      originalEditor.onDidChangeModelContent(() => {
        if (syncingEditors) {
          return
        }
        store.original = originalEditor?.getValue() ?? ''
        store.activeDiffIndex = -1
        refreshComparison()
      })
      originalEditor.onDidScrollChange(() => {
        if (changedEditor) {
          syncScroll(originalEditor!, changedEditor)
        }
      })
    }
    if (changedRef.value && !changedEditor) {
      changedEditor = EditorCreate(changedRef.value, await editorConfig(store.changed))!
      changedDecorations = changedEditor.createDecorationsCollection()
      changedEditor.onDidChangeModelContent(() => {
        if (syncingEditors) {
          return
        }
        store.changed = changedEditor?.getValue() ?? ''
        store.activeDiffIndex = -1
        refreshComparison()
      })
      changedEditor.onDidScrollChange(() => {
        if (originalEditor) {
          syncScroll(changedEditor!, originalEditor)
        }
      })
    }
    refreshComparisonImmediate()
  }

  onMounted(() => {
    initEditors().catch()
  })

  onUnmounted(() => {
    refreshComparison.cancel()
    EditorDestroy(originalEditor)
    EditorDestroy(changedEditor)
  })
</script>

<template>
  <div class="host-edit tools diff-compare">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('tools.diff-compare-title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <el-scrollbar class="flex-1">
      <div class="main-wapper pb-0">
        <div class="main p-0">
          <el-card class="mb-3">
            <div class="flex flex-wrap items-center gap-3">
              <el-button @click="loadSample">Load Sample</el-button>
              <el-button @click="swapInputs">Swap</el-button>
              <el-button @click="clearInputs">Clear</el-button>
              <el-button :disabled="diffTargets.length === 0" @click="goToDiff(-1)"
                >Previous Diff</el-button
              >
              <el-button :disabled="diffTargets.length === 0" @click="goToDiff(1)"
                >Next Diff</el-button
              >
              <el-button @click="copyDiff">Copy Result</el-button>
            </div>
          </el-card>

          <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <el-card header="Original text">
              <div ref="originalRef" class="diff-editor"></div>
            </el-card>
            <el-card header="Changed text">
              <div ref="changedRef" class="diff-editor"></div>
            </el-card>
          </div>

          <el-card class="mt-3" header="Comparison summary">
            <div class="flex flex-wrap gap-2">
              <el-tag type="success">Added: {{ stats.added }}</el-tag>
              <el-tag type="danger">Removed: {{ stats.removed }}</el-tag>
              <el-tag type="warning">Changed: {{ stats.changed }}</el-tag>
              <el-tag type="info">Unchanged: {{ stats.unchanged }}</el-tag>
            </div>
          </el-card>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<style lang="scss">
  .diff-compare {
    .diff-editor {
      width: 100%;
      min-width: 0;
      height: 360px;
      overflow: hidden;
      border: 1px solid var(--el-border-color);
      border-radius: var(--el-border-radius-base);
    }

    :deep(.el-card__body) {
      min-width: 0;
    }

    :deep(.monaco-editor) {
      width: 100% !important;
    }

    :deep(.monaco-editor .overflow-guard) {
      width: 100% !important;
    }

    .diff-compare-added-line {
      background: rgba(34, 197, 94, 0.14);
    }

    .diff-compare-removed-line {
      background: rgba(239, 68, 68, 0.14);
    }

    .diff-compare-added-text {
      background: rgba(34, 197, 94, 0.32);
      border-radius: 3px;
    }

    .diff-compare-removed-text {
      background: rgba(239, 68, 68, 0.32);
      border-radius: 3px;
    }
  }
</style>
