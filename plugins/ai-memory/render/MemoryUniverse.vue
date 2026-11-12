<template>
  <div v-loading="busy" class="memory-universe">
    <header class="universe-topbar">
      <div class="universe-title">
        <span class="universe-live-dot"></span>
        <strong>{{ T('universe') }}</strong>
        <span>{{ memories.length }} {{ T('memoriesCount') }}</span>
        <i></i>
        <span>{{ data.semanticEdgeCount }} {{ T('connectionsCount') }}</span>
      </div>
      <div class="universe-controls">
        <el-button size="small" :aria-pressed="autoRotate" @click="autoRotate = !autoRotate">
          {{ T(autoRotate ? 'pauseRotate' : 'autoRotate') }}
        </el-button>
        <el-button
          size="small"
          :aria-pressed="reducedMotion"
          @click="reducedMotion = !reducedMotion"
        >
          {{ T('reduceMotion') }}
        </el-button>
        <el-button size="small" :aria-label="T('zoomOut')" @click="scene?.zoom(160)">−</el-button>
        <el-button size="small" :aria-label="T('zoomIn')" @click="scene?.zoom(-160)">+</el-button>
        <el-button size="small" @click="resetCamera">{{ T('resetView') }}</el-button>
      </div>
    </header>
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
      <div v-if="hovered && !dragging && available" class="universe-hover-card" :style="hoverStyle">
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
      <div v-if="!memories.length && available" class="universe-empty-caption">{{
        T('empty')
      }}</div>
      <div class="universe-help">{{ T('universeHelp') }}</div>
    </div>
    <footer class="universe-legend" :aria-label="T('type')">
      <button :class="{ active: !focusedId }" :aria-pressed="!focusedId" @click="resetCamera">
        {{ T('allTypes') }} <small>{{ memories.length }}</small>
      </button>
      <button
        v-for="(type, category) in MEMORY_TYPES"
        :key="type"
        :class="{ active: focusedId === categoryNodeId(type) }"
        :aria-pressed="focusedId === categoryNodeId(type)"
        @click="focusCategory(type)"
      >
        <i :style="{ background: MEMORY_COLORS[type] }"></i>{{ T(type) }}
        <small>{{ categoryCounts[category] }}</small>
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
  import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
  import { MEMORY_TYPES, type MemoryType, type SearchHit } from '../shared'
  import { MemoryT as T } from './lang'
  import { MEMORY_COLORS } from './universe'
  import { buildNeuralData, categoryNodeId } from './neural/data'
  import { NeuralScene, type NeuralNode } from './neural/scene'

  const props = defineProps<{ memories: SearchHit[]; busy?: boolean }>()
  const emit = defineEmits<{ select: [hit: SearchHit] }>()
  const canvasWrap = ref<HTMLDivElement>()
  const data = computed(() => buildNeuralData(props.memories, T))
  const categoryCounts = computed(() =>
    MEMORY_TYPES.map((type) => props.memories.filter((hit) => hit.type === type).length)
  )
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
  let media: MediaQueryList | undefined
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
    if (hit) emit('select', hit)
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

  function focusCategory(type: MemoryType) {
    const id = categoryNodeId(type)
    focusedId.value = id
    hovered.value = undefined
    pointer = undefined
    scene?.select(id)
    scene?.focus(id)
  }

  function resetCamera() {
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

  function onMotionPreference(event: MediaQueryListEvent) {
    reducedMotion.value = event.matches
  }

  watch(autoRotate, (value) => scene?.setAutoRotate(value))
  watch(reducedMotion, (value) => scene?.setReducedMotion(value))
  watch(
    data,
    () => {
      disposeScene()
      initialize()
    },
    { flush: 'post' }
  )
  onMounted(() => {
    active = true
    media = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.value = media.matches
    media.addEventListener('change', onMotionPreference)
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
    media?.removeEventListener('change', onMotionPreference)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    disposeScene()
  })
</script>

<style scoped>
  .memory-universe {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    min-height: 430px;
    overflow: hidden;
    color: #d8c9ab;
    background: #000;
    border: 1px solid #b996582c;
    border-radius: 14px;
  }
  .universe-topbar {
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    padding: 12px 16px;
    background: #090b0de6;
    border-bottom: 1px solid #d9b8751c;
  }
  .universe-title,
  .universe-controls {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .universe-title strong {
    color: #eddfc4;
    font-size: 13px;
    letter-spacing: 0.1em;
  }
  .universe-title > span:not(.universe-live-dot) {
    color: #b29d78;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .universe-title i {
    width: 1px;
    height: 12px;
    background: #c9a86a38;
  }
  .universe-live-dot {
    width: 6px;
    height: 6px;
    background: #f4c36c;
    border-radius: 50%;
    box-shadow: 0 0 10px #f4c36c88;
  }
  .universe-controls .el-button {
    margin: 0;
    color: #cdb993;
    background: #191a1c;
    border-color: #b9965838;
  }
  .universe-controls .el-button:hover,
  .universe-controls .el-button[aria-pressed='true'] {
    color: #f7db9e;
    border-color: #d5ad5966;
    background: #362c1d;
  }
  .universe-canvas-wrap {
    position: relative;
    flex: 1;
    min-height: 320px;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
  }
  .universe-canvas-wrap.dragging {
    cursor: grabbing;
  }
  .universe-empty-caption {
    position: absolute;
    z-index: 1;
    top: 12px;
    left: 16px;
    color: #b4a489;
    font-size: 12px;
    pointer-events: none;
  }
  .universe-help {
    position: absolute;
    z-index: 1;
    right: 12px;
    bottom: 10px;
    left: 12px;
    color: #b4a48999;
    font-size: 10px;
    text-align: center;
    pointer-events: none;
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
  .universe-legend {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 12px;
    background: #090b0de6;
    border-top: 1px solid #d9b8751c;
  }
  .universe-legend button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 8px;
    color: #a99b85;
    font: inherit;
    font-size: 11px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    cursor: pointer;
  }
  .universe-legend button:hover,
  .universe-legend button.active {
    color: #f4d698;
    border-color: #c3a15e47;
    background: #2a2318;
  }
  .universe-legend button:focus-visible {
    outline: 2px solid #e4c07e;
    outline-offset: 2px;
  }
  .universe-legend i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
  }
  .universe-legend small {
    color: #9d8b6a;
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 640px) {
    .universe-topbar {
      padding: 10px;
    }
    .universe-controls {
      gap: 5px;
    }
    .universe-legend {
      gap: 3px;
    }
    .universe-legend button {
      padding: 6px;
    }
  }
</style>
