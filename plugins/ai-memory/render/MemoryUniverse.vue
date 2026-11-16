<template>
  <div class="memory-universe" :class="{ 'show-browser': browserOpen, 'has-detail': detailOpen }">
    <header class="universe-topbar">
      <slot name="toolbar" />
      <div class="universe-heading">
        <div class="universe-heading-name"
          ><span class="universe-eyebrow">MEMORY SPACE</span><h1>{{ scopeLabel }}</h1>
          <slot name="heading-after" />
          <button
            type="button"
            class="browser-toggle"
            :aria-expanded="browserOpen"
            @click="browserOpen = !browserOpen"
            >{{ T(activeCategory ? 'categoryMemories' : 'networkOverview') }}</button
          >
        </div>
        <div class="universe-controls">
          <button type="button" :aria-pressed="autoRotate" @click="autoRotate = !autoRotate">{{
            T(autoRotate ? 'pauseRotate' : 'autoRotate')
          }}</button>
          <button
            type="button"
            :aria-pressed="reducedMotion"
            @click="reducedMotion = !reducedMotion"
            >{{ T('reduceMotion') }}</button
          >
          <button type="button" :aria-label="T('zoomOut')" @click="scene?.zoom(160)">−</button>
          <button type="button" :aria-label="T('zoomIn')" @click="scene?.zoom(-160)">+</button>
          <button type="button" @click="resetCamera">{{ T('resetView') }}</button>
        </div>
      </div>
      <div class="universe-notices"><slot name="notices" /></div>
    </header>
    <div v-loading="busy" class="universe-body" :aria-busy="busy">
      <div
        ref="canvasWrap"
        class="universe-canvas-wrap"
        :class="{ dragging: !!dragging }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
        @lostpointercapture="onPointerCancel"
        @pointerleave="onPointerLeave"
        @wheel.prevent="onWheel"
      >
        <div
          v-if="hovered && !dragging && available"
          class="universe-hover-card"
          :style="hoverStyle"
        >
          <div class="universe-hover-type">
            <span :style="{ background: hovered.color }"></span>
            {{ T(MEMORY_TYPES[hovered.category]) }}
            <small v-if="hoveredHit">REV {{ hoveredHit.revision }}</small>
          </div>
          <strong>{{ hovered.label }}</strong>
          <p v-if="hoveredHit">{{ hoveredHit.summary }}</p>
          <div v-if="hoveredHit" class="universe-hover-topic">{{ hoveredHit.topic }}</div>
        </div>
        <div v-if="!available" class="universe-unavailable" role="status">
          <span>{{ T('universeUnavailable') }}</span>
          <el-button size="small" @click="initialize">{{ T('retry') }}</el-button>
        </div>
      </div>

      <MemoryBrowser
        class="universe-browser"
        :memories="memories"
        :hits-by-node-id="data.hitsByNodeId"
        :relation-count="data.semanticEdgeCount"
        :scope-label="scopeLabel"
        :category="activeCategory"
        :selected-id="selectedId"
        @select="chooseMemory"
        @reset="resetCamera"
        @close="browserOpen = false"
      />
      <div v-if="!memories.length && !busy" class="universe-empty-caption" role="status"
        ><slot name="empty">{{ T('empty') }}</slot></div
      >
      <aside
        v-if="detailOpen"
        id="memory-detail"
        class="universe-detail"
        :style="{ '--active-color': selectedHit ? MEMORY_COLORS[selectedHit.type] : '#c9ad72' }"
        :aria-label="T('memoryDetail')"
      >
        <header
          ><span class="universe-eyebrow">MEMORY NEURON</span
          ><button type="button" :aria-label="T('closeDetail')" @click="$emit('closeDetail')"
            >×</button
          ></header
        >
        <slot name="detail" :related-count="relatedCount" />
      </aside>
    </div>
    <footer class="universe-bottom">
      <nav class="universe-legend" :aria-label="T('type')">
        <button
          :class="{ active: !activeCategory }"
          :aria-pressed="!activeCategory"
          @click="resetCamera"
        >
          {{ T('allTypes') }} <small>{{ memories.length }}</small>
        </button>
        <button
          v-for="(type, category) in MEMORY_TYPES"
          :key="type"
          :class="{ active: activeCategory === type }"
          :aria-pressed="activeCategory === type"
          @click="focusCategory(type)"
        >
          <i :style="{ background: MEMORY_COLORS[type] }"></i>{{ T(type) }}
          <small>{{ categoryCounts[category] }}</small>
        </button>
      </nav>
    </footer>
  </div>
</template>

<script setup lang="ts">
  import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
  import { MEMORY_TYPES, type MemoryType, type SearchHit } from '../shared'
  import { MemoryT as T } from './lang'
  import MemoryBrowser from './MemoryBrowser.vue'
  import { MEMORY_COLORS } from './universe'
  import { buildNeuralData, categoryNodeId } from './neural/data'
  import { NeuralScene, type NeuralNode } from './neural/scene'

  const props = defineProps<{
    memories: SearchHit[]
    busy?: boolean
    scopeLabel: string
    detailOpen?: boolean
    selectedHit?: SearchHit
  }>()
  const emit = defineEmits<{ select: [hit: SearchHit]; closeDetail: [] }>()
  const canvasWrap = ref<HTMLDivElement>()
  const data = computed(() => buildNeuralData(props.memories, T))
  const categoryCounts = computed(() =>
    MEMORY_TYPES.map((type) => props.memories.filter((hit) => hit.type === type).length)
  )
  const activeCategory = ref<MemoryType>()
  const browserOpen = ref(false)
  const selectedId = computed(
    () => [...data.value.hitsByNodeId].find(([, hit]) => hit === props.selectedHit)?.[0]
  )
  const relatedCount = computed(() => {
    const index = data.value.model.nodes.findIndex((node) => node.id === selectedId.value)
    return index < 0 ? 0 : (data.value.model.semanticNeighbors?.(index).length ?? 0)
  })
  const autoRotate = ref(true)
  const reducedMotion = ref(false)
  const available = ref(true)
  const hovered = ref<NeuralNode>()
  const focusedId = ref('')
  const hoverPosition = ref({ x: 0, y: 0 })
  const dragging = ref<{
    pointerId: number
    x: number
    y: number
    startX: number
    startY: number
    moved: boolean
  }>()
  const hoveredHit = computed(() =>
    hovered.value ? data.value.hitsByNodeId.get(hovered.value.id) : undefined
  )
  const hoverStyle = computed(() => {
    const position = hoverPosition.value
    return {
      left: `${Math.max(12, Math.min((position?.x ?? 0) + 18, (canvasWrap.value?.clientWidth ?? 300) - 286))}px`,
      top: `${Math.max(12, Math.min((position?.y ?? 0) + 16, (canvasWrap.value?.clientHeight ?? 300) - 190))}px`
    }
  })

  let scene: NeuralScene | undefined
  let frame = 0
  let active = false
  let contextCanvas: HTMLCanvasElement | undefined
  let pointer: { x: number; y: number } | undefined

  function stopFrame() {
    cancelAnimationFrame(frame)
    frame = 0
  }

  function disposeScene() {
    stopFrame()
    contextCanvas?.removeEventListener('webglcontextlost', onContextLost)
    contextCanvas = undefined
    const previous = scene
    scene = undefined
    previous?.dispose()
    dragging.value = undefined
    hovered.value = undefined
    pointer = undefined
    if (canvasWrap.value) canvasWrap.value.style.cursor = 'grab'
  }

  function unavailable() {
    disposeScene()
    available.value = false
  }

  function onContextLost(event: Event) {
    event.preventDefault()
    unavailable()
  }

  function scheduleFrame() {
    if (!frame && scene && active && !document.hidden) frame = requestAnimationFrame(draw)
  }

  function draw(time: number) {
    frame = 0
    if (!scene || !active) return
    try {
      scene.render(time)
      if (pointer && !dragging.value) updateHover(pointer.x, pointer.y)
      scheduleFrame()
    } catch (error) {
      console.warn('AI Memory star map unavailable', error)
      unavailable()
    }
  }

  function initialize() {
    if (!active || !canvasWrap.value || scene) return
    available.value = true
    focusedId.value = ''
    try {
      scene = new NeuralScene(canvasWrap.value, data.value.model, {
        autoRotate: autoRotate.value,
        reducedMotion: reducedMotion.value,
        onUnavailable: unavailable
      })
      contextCanvas = scene.renderer.domElement
      contextCanvas.setAttribute('role', 'img')
      contextCanvas.setAttribute('aria-label', T('universeHelp'))
      contextCanvas.addEventListener('webglcontextlost', onContextLost)
      scheduleFrame()
    } catch (error) {
      console.warn('AI Memory star map initialization failed', error)
      unavailable()
    }
  }

  function updateHover(x: number, y: number) {
    hovered.value = scene?.pick(x, y)
    if (hovered.value) {
      const position = scene?.getNodeScreenPosition(hovered.value.id)
      if (position) hoverPosition.value = position
    }
    if (canvasWrap.value) canvasWrap.value.style.cursor = hovered.value ? 'pointer' : 'grab'
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 || !scene || dragging.value || !canvasWrap.value) return
    pointer = undefined
    hovered.value = undefined
    dragging.value = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    }
    canvasWrap.value.setPointerCapture(event.pointerId)
    canvasWrap.value.style.cursor = 'grabbing'
  }

  function onPointerMove(event: PointerEvent) {
    const drag = dragging.value
    if (!drag) {
      pointer = { x: event.clientX, y: event.clientY }
      updateHover(event.clientX, event.clientY)
      return
    }
    if (event.pointerId !== drag.pointerId) return
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true
    if (drag.moved) scene?.rotate(event.clientX - drag.x, event.clientY - drag.y)
    drag.x = event.clientX
    drag.y = event.clientY
  }

  function onPointerUp(event: PointerEvent) {
    const drag = dragging.value
    if (!drag || event.pointerId !== drag.pointerId) return
    dragging.value = undefined
    if (canvasWrap.value?.hasPointerCapture(event.pointerId))
      canvasWrap.value.releasePointerCapture(event.pointerId)
    pointer = { x: event.clientX, y: event.clientY }
    updateHover(event.clientX, event.clientY)
    const node = hovered.value
    if (drag.moved || !node) return
    focusedId.value = node.id
    scene?.select(node.id)
    scene?.focus(node.id)
    const hit = data.value.hitsByNodeId.get(node.id)
    if (hit) chooseMemory(hit)
    else focusCategory(MEMORY_TYPES[node.category])
  }

  function onPointerCancel(event: PointerEvent) {
    if (dragging.value && event.pointerId !== dragging.value.pointerId) return
    dragging.value = undefined
    onPointerLeave()
    if (canvasWrap.value) canvasWrap.value.style.cursor = 'grab'
  }

  function onPointerLeave() {
    if (!dragging.value) {
      hovered.value = undefined
      pointer = undefined
    }
  }

  function onWheel(event: WheelEvent) {
    scene?.zoom(Math.max(-240, Math.min(240, event.deltaY * (event.deltaMode === 1 ? 16 : 1))))
  }

  function chooseMemory(hit: SearchHit) {
    const id = [...data.value.hitsByNodeId].find(([, entry]) => entry === hit)?.[0]
    if (!id) return
    activeCategory.value = hit.type
    browserOpen.value = false
    focusedId.value = id
    scene?.select(id)
    scene?.focus(id)
    emit('select', hit)
  }

  function focusCategory(type: MemoryType) {
    activeCategory.value = type
    browserOpen.value = true
    const id = categoryNodeId(type)
    focusedId.value = id
    hovered.value = undefined
    pointer = undefined
    scene?.select(id)
    scene?.focus(id)
  }

  function resetCamera() {
    activeCategory.value = undefined
    focusedId.value = ''
    hovered.value = undefined
    pointer = undefined
    if (scene) scene.root.rotation.set(-0.1, 0.16, 0)
    scene?.select()
    scene?.focus()
  }

  function onVisibilityChange() {
    if (document.hidden) stopFrame()
    else scheduleFrame()
  }

  watch(
    () => props.detailOpen,
    (open) => {
      if (!open) {
        focusedId.value = activeCategory.value ? categoryNodeId(activeCategory.value) : ''
        scene?.select(focusedId.value || undefined)
      }
    }
  )
  watch(autoRotate, (value) => scene?.setAutoRotate(value))
  watch(reducedMotion, (value) => scene?.setReducedMotion(value))
  watch(
    data,
    () => {
      activeCategory.value = undefined
      browserOpen.value = false
      disposeScene()
      initialize()
    },
    { flush: 'post' }
  )
  onMounted(() => {
    active = true
    document.addEventListener('visibilitychange', onVisibilityChange)
    initialize()
  })
  onActivated(() => {
    active = true
    initialize()
  })
  onDeactivated(() => {
    active = false
    disposeScene()
  })
  onBeforeUnmount(() => {
    active = false
    document.removeEventListener('visibilitychange', onVisibilityChange)
    disposeScene()
  })
</script>

<style scoped>
  .memory-universe {
    container: memory-universe / inline-size;
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    min-height: 500px;
    overflow: hidden;
    color: #d8c9ab;
    background: #000;
    border: 1px solid #b996582c;
    border-radius: 12px;
    --el-color-primary: #bda16b;
    --el-text-color-primary: #d8c9ab;
    --el-text-color-regular: #b4b09e;
    --el-text-color-placeholder: #777d6d;
    --el-border-color: #b9965838;
    --el-border-color-light: #b9965828;
    --el-fill-color-blank: #101316;
    --el-fill-color-light: #181d1c;
    --el-bg-color: #101316;
    --el-mask-color: #080a0c88;
  }
  .memory-universe button {
    font: inherit;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .memory-universe button:focus-visible {
    outline: 2px solid #e4c07e;
    outline-offset: 2px;
  }
  .universe-topbar {
    position: relative;
    z-index: 5;
    padding: 22px 24px 0;
  }
  .universe-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin: 22px 2px 16px;
  }
  .universe-heading > div {
    display: flex;
    align-items: center;
    min-width: 0;
  }
  .universe-heading-name {
    flex: 1;
  }
  .universe-eyebrow {
    font:
      9px ui-monospace,
      monospace;
    letter-spacing: 0.15em;
    color: #8c7957;
  }
  .universe-heading h1 {
    font-size: 15px;
    font-weight: 500;
    margin: 0 0 0 12px;
    color: #d6c7a8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .universe-notices {
    max-height: 180px;
    overflow: auto;
    font-size: 12px;
  }
  .universe-notices:empty {
    display: none;
  }
  .universe-notices :deep(.el-alert) {
    margin: 8px 0;
  }
  .universe-notices :deep(.el-alert__description) {
    overflow-wrap: anywhere;
  }
  .universe-body {
    position: relative;
    flex: 1;
    min-height: 200px;
  }
  .universe-canvas-wrap {
    position: absolute;
    z-index: 0;
    inset: 0 22px;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
  }
  .universe-canvas-wrap.dragging {
    cursor: grabbing;
  }
  .universe-browser {
    position: absolute;
    z-index: 3;
    top: 10px;
    left: 24px;
    bottom: 10px;
    width: 244px;
    padding: 15px;
    box-sizing: border-box;
    background: #101316d9;
    border: 1px solid #bda36b2c;
    border-radius: 9px;
    box-shadow: 0 12px 35px #0003;
  }
  .universe-detail {
    overflow-wrap: anywhere;
    position: absolute;
    z-index: 4;
    top: 10px;
    right: 24px;
    bottom: 10px;
    width: 304px;
    padding: 18px;
    box-sizing: border-box;
    overflow: auto;
    background: #0e1113ef;
    border: 1px solid color-mix(in srgb, var(--active-color, #c9ad72) 25%, transparent);
    border-radius: 10px;
    box-shadow: 0 15px 45px #0008;
    scrollbar-width: thin;
    scrollbar-color: #555345 transparent;
  }
  .universe-browser[data-mode='category'] {
    border-color: color-mix(in srgb, var(--active-color, #c9ad72) 25%, transparent);
  }
  .universe-detail .universe-eyebrow {
    color: var(--active-color, #c9ad72);
  }
  .universe-detail > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 18px;
  }
  .universe-detail > header button {
    font-size: 22px;
    color: #979b90;
    padding: 0 5px;
  }
  .universe-detail :deep(.el-descriptions__body) {
    background: transparent;
    color: #b4b09e;
  }
  .universe-detail :deep(.el-descriptions__label) {
    color: #737d71;
  }
  .universe-detail :deep(.el-descriptions__cell) {
    overflow-wrap: anywhere;
  }
  .universe-empty-caption {
    position: absolute;
    z-index: 2;
    top: 40%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(330px, 80%);
    padding: 18px;
    text-align: center;
    font-size: 12px;
    line-height: 1.8;
    color: #a29f93;
    background: #080a0ce6;
    border-radius: 8px;
  }
  .universe-bottom {
    z-index: 3;
    padding: 16px 24px 20px;
  }
  .universe-controls {
    flex-shrink: 0;
    margin-left: auto;
    display: flex;
    gap: 5px;
    align-items: center;
  }
  .universe-controls button {
    padding: 7px 8px;
    font-size: 10px;
    color: #979b86;
    white-space: nowrap;
  }
  .universe-controls button:hover,
  .universe-controls button[aria-pressed='true'] {
    color: #d4bd86;
  }
  .universe-legend {
    display: flex;
    justify-content: center;
    gap: 6px;
  }
  .universe-legend button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 8px;
    color: #8c927b;
    font-size: 11px;
    white-space: nowrap;
    border: 1px solid transparent;
    border-radius: 5px;
  }
  .universe-legend button:hover,
  .universe-legend button.active {
    color: #ddc99a;
    background: #a68c510e;
    border-color: #c3a15e47;
  }
  .universe-legend i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
  }
  .universe-legend small {
    color: #777e64;
    font:
      9px ui-monospace,
      monospace;
  }
  .browser-toggle {
    display: none;
  }
  @container memory-universe (max-width:1000px) {
    .universe-browser {
      display: none;
      left: 18px;
      width: 252px;
      background: #101518f5;
    }
    .show-browser .universe-browser {
      display: flex;
    }
    .show-browser .universe-canvas-wrap {
      opacity: 0.3;
    }
    .browser-toggle {
      display: inline-flex;
      font-size: 10px;
      margin-left: 12px;
      padding: 5px 8px;
      border: 1px solid #bca16a38;
      border-radius: 4px;
      color: #bdac85;
      background: #151917;
      white-space: nowrap;
    }
    .universe-eyebrow {
      display: none;
    }
    .universe-heading h1 {
      margin: 0;
      font-size: 14px;
    }
    .universe-legend {
      justify-content: flex-start;
      overflow: auto;
      scrollbar-width: thin;
    }
    .universe-legend button {
      flex-shrink: 0;
    }
    .universe-canvas-wrap {
      left: 18px;
      right: 18px;
    }
  }
  @container memory-universe (max-width:640px) {
    .universe-topbar {
      padding: 16px 15px 0;
    }
    .universe-heading {
      margin-top: 18px;
    }
    .universe-heading-name {
      flex-basis: 100%;
    }
    .universe-controls {
      width: 100%;
      justify-content: flex-end;
    }
    .universe-heading h1 {
      max-width: 100px;
      font-size: 12px;
    }
    .browser-toggle {
      margin-left: 6px;
      padding: 5px;
      font-size: 9px;
    }
    .universe-browser,
    .universe-detail {
      left: 15px;
      right: 15px;
      width: auto;
      background: #0e1316fa;
    }
    .show-browser .universe-detail {
      display: none;
    }
    .universe-canvas-wrap {
      left: 8px;
      right: 8px;
    }
    .universe-bottom {
      padding: 12px 15px;
    }
    .universe-controls button {
      padding: 7px 5px;
    }
  }
  .universe-hover-card {
    position: absolute;
    z-index: 3;
    width: min(274px, calc(100% - 24px));
    box-sizing: border-box;
    padding: 14px;
    color: #f2e9d7;
    background: #101113ed;
    border: 1px solid #c4a56740;
    border-radius: 10px;
    box-shadow: 0 16px 42px #0006;
    backdrop-filter: blur(16px);
    pointer-events: none;
  }
  .universe-hover-type {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    color: #beac8c;
    font-size: 11px;
  }
  .universe-hover-type > span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .universe-hover-type small {
    margin-left: auto;
    color: #8e8370;
  }
  .universe-hover-card > strong {
    display: block;
    overflow: hidden;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .universe-hover-card p {
    display: -webkit-box;
    margin: 7px 0;
    overflow: hidden;
    color: #b4ab9c;
    font-size: 12px;
    line-height: 1.55;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .universe-hover-topic {
    overflow: hidden;
    color: #d0b47c;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .universe-unavailable {
    position: absolute;
    z-index: 4;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 16px;
    padding: 24px;
    background: #090b0d;
    text-align: center;
  }
</style>
