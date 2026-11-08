<template>
  <div ref="stage" v-loading="busy" class="memory-universe">
    <header class="universe-topbar">
      <div class="universe-title">
        <span class="universe-live-dot"></span>
        <strong>{{ T('universe') }}</strong>
        <span>{{ memories.length }} {{ T('memoriesCount') }}</span>
        <i></i>
        <span>{{ graph.edges.length }} {{ T('connectionsCount') }}</span>
      </div>
      <div class="universe-controls">
        <el-button size="small" @click="autoRotate = !autoRotate">
          {{ T(autoRotate ? 'pauseRotate' : 'autoRotate') }}
        </el-button>
        <el-button size="small" :aria-label="T('zoomOut')" @click="zoomBy(-0.15)">−</el-button>
        <el-button size="small" :aria-label="T('zoomIn')" @click="zoomBy(0.15)">+</el-button>
        <el-button size="small" @click="resetCamera">{{ T('resetView') }}</el-button>
      </div>
    </header>
    <div ref="canvasWrap" class="universe-canvas-wrap">
      <canvas
        ref="canvas"
        class="universe-canvas"
        :class="{ dragging: !!dragging }"
        role="img"
        :aria-label="T('universeHelp')"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
        @lostpointercapture="onPointerCancel"
        @pointerleave="onPointerLeave"
        @wheel.prevent="onWheel"
      ></canvas>
      <div class="universe-vignette"></div>
      <div v-if="hovered && !dragging" class="universe-hover-card" :style="hoverStyle">
        <div class="universe-hover-type">
          <span :style="{ background: hovered.color }"></span>
          {{ T(hovered.hit.type) }}
          <small>REV {{ hovered.hit.revision }}</small>
        </div>
        <strong>{{ hovered.hit.title }}</strong>
        <p>{{ hovered.hit.summary }}</p>
        <div class="universe-hover-topic">{{ hovered.hit.topic }}</div>
      </div>
      <div v-if="!available" class="universe-unavailable">
        {{ T('universeUnavailable') }}
      </div>
      <div class="universe-help">{{ T('universeHelp') }}</div>
    </div>
    <footer class="universe-legend">
      <span v-for="type in MEMORY_TYPES" :key="type">
        <i :style="{ background: MEMORY_COLORS[type] }"></i>{{ T(type) }}
      </span>
    </footer>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
  import { MEMORY_TYPES, type SearchHit } from '../shared'
  import { MemoryT as T } from './lang'
  import {
    buildUniverse,
    MEMORY_COLORS,
    pickUniverseNode,
    projectNode,
    type ProjectedNode,
    type UniverseCamera
  } from './universe'

  const props = defineProps<{ memories: SearchHit[]; busy?: boolean }>()
  const emit = defineEmits<{ select: [hit: SearchHit] }>()
  const stage = ref<HTMLDivElement>()
  const canvasWrap = ref<HTMLDivElement>()
  const canvas = ref<HTMLCanvasElement>()
  const graph = computed(() => buildUniverse(props.memories))
  const camera = reactive<UniverseCamera>({ yaw: 0.35, pitch: -0.18, zoom: 1 })
  const autoRotate = ref(false)
  const available = ref(true)
  const hovered = ref<ProjectedNode>()
  const selectedId = ref('')
  const viewWidth = ref(0)
  const viewHeight = ref(0)
  const dragging = ref<{
    pointerId: number
    x: number
    y: number
    yaw: number
    pitch: number
    moved: boolean
  }>()

  let context: CanvasRenderingContext2D | null = null
  let observer: ResizeObserver | undefined
  let frame = 0
  let lastTime = 0
  let projected: ProjectedNode[] = []
  let lastPointer: { x: number; y: number } | undefined
  const stars = Array.from({ length: 100 }, (_, index) => ({
    x: ((Math.sin(index * 91.17) + 1) / 2) % 1,
    y: ((Math.sin(index * 47.31 + 2) + 1) / 2) % 1,
    radius: 0.35 + ((index * 37) % 10) / 12,
    alpha: 0.18 + ((index * 17) % 10) / 22
  }))

  const hoverStyle = computed(() => {
    if (!hovered.value) return {}
    return {
      left: `${Math.max(12, Math.min(hovered.value.x + 18, viewWidth.value - 286))}px`,
      top: `${Math.max(12, Math.min(hovered.value.y + 16, viewHeight.value - 190))}px`
    }
  })

  function colorWithAlpha(color: string, alpha: number) {
    const value = Number.parseInt(color.slice(1), 16)
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
  }

  function resize() {
    if (!canvas.value || !canvasWrap.value || !context) return
    const rect = canvasWrap.value.getBoundingClientRect()
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    viewWidth.value = Math.max(1, rect.width)
    viewHeight.value = Math.max(1, rect.height)
    canvas.value.width = Math.round(viewWidth.value * ratio)
    canvas.value.height = Math.round(viewHeight.value * ratio)
    canvas.value.style.width = `${viewWidth.value}px`
    canvas.value.style.height = `${viewHeight.value}px`
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    scheduleDraw()
  }

  function drawBackground(width: number, height: number) {
    if (!context) return
    const background = context.createRadialGradient(
      width * 0.5,
      height * 0.46,
      0,
      width * 0.5,
      height * 0.46,
      Math.max(width, height) * 0.72
    )
    background.addColorStop(0, '#111a3c')
    background.addColorStop(0.46, '#090f26')
    background.addColorStop(1, '#030611')
    context.fillStyle = background
    context.fillRect(0, 0, width, height)
    for (const star of stars) {
      context.beginPath()
      context.arc(star.x * width, star.y * height, star.radius, 0, Math.PI * 2)
      context.fillStyle = `rgba(190, 220, 255, ${star.alpha})`
      context.fill()
    }
    context.save()
    context.translate(width / 2, height / 2)
    context.strokeStyle = 'rgba(96, 165, 250, 0.075)'
    context.lineWidth = 1
    for (const scale of [0.55, 0.8, 1.05]) {
      context.beginPath()
      context.ellipse(0, 0, width * 0.34 * scale, height * 0.13 * scale, 0, 0, Math.PI * 2)
      context.stroke()
    }
    context.restore()
  }

  function drawCore(width: number, height: number) {
    if (!context) return
    const x = width / 2
    const y = height / 2
    const glow = context.createRadialGradient(x, y, 0, x, y, 58)
    glow.addColorStop(0, 'rgba(103, 232, 249, 0.2)')
    glow.addColorStop(0.35, 'rgba(59, 130, 246, 0.08)')
    glow.addColorStop(1, 'rgba(59, 130, 246, 0)')
    context.fillStyle = glow
    context.fillRect(x - 60, y - 60, 120, 120)
    context.beginPath()
    context.arc(x, y, 3, 0, Math.PI * 2)
    context.fillStyle = 'rgba(207, 250, 254, 0.8)'
    context.fill()
    context.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace'
    context.textAlign = 'center'
    context.fillStyle = 'rgba(165, 180, 252, 0.42)'
    context.fillText('AI MEMORY', x, y + 24)
  }

  function scheduleDraw() {
    if (!frame && context) frame = requestAnimationFrame(draw)
  }

  function draw(time: number) {
    frame = 0
    if (!context || !canvas.value) return
    const delta = Math.min(50, Math.max(0, time - lastTime))
    lastTime = time
    if (autoRotate.value && !dragging.value) camera.yaw += delta * 0.000075
    const width = viewWidth.value
    const height = viewHeight.value
    context.clearRect(0, 0, width, height)
    drawBackground(width, height)
    drawCore(width, height)
    projected = graph.value.nodes.map((node) => projectNode(node, camera, width, height))
    const positions = new Map(projected.map((node) => [node.id, node]))
    context.lineWidth = 0.8
    for (const edge of graph.value.edges) {
      const source = positions.get(edge.source)
      const target = positions.get(edge.target)
      if (!source || !target) continue
      const gradient = context.createLinearGradient(source.x, source.y, target.x, target.y)
      gradient.addColorStop(0, colorWithAlpha(source.color, 0.22))
      gradient.addColorStop(1, colorWithAlpha(target.color, 0.22))
      context.strokeStyle = gradient
      context.beginPath()
      context.moveTo(source.x, source.y)
      context.lineTo(target.x, target.y)
      context.stroke()
    }
    const ordered = [...projected].sort((a, b) => b.depth - a.depth)
    for (const node of ordered) {
      const inactive = node.hit.status === 'archived' || node.hit.expired
      const alpha = inactive ? 0.36 : 0.92
      const radius = node.screenRadius
      const glow = context.createRadialGradient(node.x, node.y, 0, node.x, node.y, radius * 3.4)
      glow.addColorStop(0, colorWithAlpha(node.color, alpha * 0.55))
      glow.addColorStop(0.35, colorWithAlpha(node.color, alpha * 0.18))
      glow.addColorStop(1, colorWithAlpha(node.color, 0))
      context.fillStyle = glow
      context.fillRect(node.x - radius * 3.5, node.y - radius * 3.5, radius * 7, radius * 7)
      if (node.hit.pinned || selectedId.value === node.id) {
        context.beginPath()
        context.arc(node.x, node.y, radius + 5, 0, Math.PI * 2)
        context.strokeStyle = colorWithAlpha(node.color, 0.65)
        context.lineWidth = 1
        context.stroke()
      }
      context.beginPath()
      context.arc(node.x, node.y, radius, 0, Math.PI * 2)
      context.fillStyle = colorWithAlpha(node.color, alpha)
      context.fill()
      context.beginPath()
      context.arc(node.x - radius * 0.25, node.y - radius * 0.28, radius * 0.3, 0, Math.PI * 2)
      context.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`
      context.fill()
      if (width > 520) {
        const title = node.hit.title
        const label = title.length > 24 ? `${title.slice(0, 23)}…` : title
        context.font = `${node.hit.pinned ? 600 : 500} 11px -apple-system, BlinkMacSystemFont, sans-serif`
        context.textAlign = node.x > width * 0.72 ? 'right' : 'left'
        context.fillStyle = `rgba(226, 232, 240, ${inactive ? 0.35 : 0.72})`
        context.fillText(
          label,
          node.x + (context.textAlign === 'right' ? -radius - 8 : radius + 8),
          node.y + 4
        )
      }
    }
    if (lastPointer && !dragging.value) {
      hovered.value = pickUniverseNode(projected, lastPointer.x, lastPointer.y)
      if (canvas.value) canvas.value.style.cursor = hovered.value ? 'pointer' : 'grab'
    }
    if (autoRotate.value && !dragging.value) scheduleDraw()
  }

  function pointerPosition(event: PointerEvent) {
    const rect = canvas.value!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function updateHover(event: PointerEvent) {
    lastPointer = pointerPosition(event)
    hovered.value = pickUniverseNode(projected, lastPointer.x, lastPointer.y)
    if (canvas.value) canvas.value.style.cursor = hovered.value ? 'pointer' : 'grab'
    scheduleDraw()
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 || !canvas.value || dragging.value) return
    lastPointer = pointerPosition(event)
    dragging.value = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      yaw: camera.yaw,
      pitch: camera.pitch,
      moved: false
    }
    canvas.value.setPointerCapture(event.pointerId)
    canvas.value.style.cursor = 'grabbing'
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging.value) {
      updateHover(event)
      return
    }
    if (event.pointerId !== dragging.value.pointerId) return
    const dx = event.clientX - dragging.value.x
    const dy = event.clientY - dragging.value.y
    if (Math.abs(dx) + Math.abs(dy) > 3) dragging.value.moved = true
    camera.yaw = dragging.value.yaw + dx * 0.006
    camera.pitch = Math.max(-1.15, Math.min(1.15, dragging.value.pitch + dy * 0.004))
    hovered.value = undefined
    scheduleDraw()
  }

  function onPointerUp(event: PointerEvent) {
    if (!dragging.value || event.pointerId !== dragging.value.pointerId) return
    const moved = dragging.value.moved
    dragging.value = undefined
    if (canvas.value?.hasPointerCapture(event.pointerId)) {
      canvas.value.releasePointerCapture(event.pointerId)
    }
    updateHover(event)
    if (!moved && hovered.value) {
      selectedId.value = hovered.value.id
      emit('select', hovered.value.hit)
    }
    if (autoRotate.value) scheduleDraw()
  }

  function onPointerCancel(event: PointerEvent) {
    if (dragging.value && event.pointerId !== dragging.value.pointerId) return
    dragging.value = undefined
    hovered.value = undefined
    lastPointer = undefined
    if (canvas.value) canvas.value.style.cursor = 'grab'
    scheduleDraw()
  }

  function onPointerLeave() {
    if (!dragging.value) {
      hovered.value = undefined
      lastPointer = undefined
    }
  }

  function onWheel(event: WheelEvent) {
    zoomBy(event.deltaY > 0 ? -0.1 : 0.1)
  }

  function zoomBy(amount: number) {
    camera.zoom = Math.max(0.65, Math.min(2.4, camera.zoom + amount))
    scheduleDraw()
  }

  function resetCamera() {
    camera.yaw = 0.35
    camera.pitch = -0.18
    camera.zoom = 1
    selectedId.value = ''
    scheduleDraw()
  }

  watch(
    () => props.memories,
    () => {
      hovered.value = undefined
      lastPointer = undefined
      selectedId.value = ''
      scheduleDraw()
    }
  )
  watch(autoRotate, (active) => {
    if (active) {
      lastTime = performance.now()
      scheduleDraw()
    } else if (frame) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  })

  onMounted(() => {
    context = canvas.value?.getContext('2d') ?? null
    if (!context || !canvasWrap.value) {
      available.value = false
      return
    }
    observer = new ResizeObserver(resize)
    observer.observe(canvasWrap.value)
    resize()
  })

  onBeforeUnmount(() => {
    cancelAnimationFrame(frame)
    observer?.disconnect()
  })
</script>

<style scoped>
  .memory-universe {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 390px;
    overflow: hidden;
    color: #dbeafe;
    background: #050816;
    border: 1px solid rgba(129, 140, 248, 0.22);
    border-radius: 18px;
    box-shadow:
      0 20px 60px rgba(2, 6, 23, 0.24),
      inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }
  .universe-topbar {
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 58px;
    padding: 10px 16px;
    background: rgba(5, 8, 22, 0.82);
    border-bottom: 1px solid rgba(129, 140, 248, 0.13);
  }
  .universe-title,
  .universe-controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .universe-title strong {
    color: #f0f9ff;
    font-size: 13px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .universe-title span:not(.universe-live-dot) {
    color: #818cf8;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
  }
  .universe-title i {
    width: 1px;
    height: 12px;
    background: rgba(129, 140, 248, 0.25);
  }
  .universe-live-dot {
    width: 7px;
    height: 7px;
    background: #22d3ee;
    border-radius: 50%;
    box-shadow: 0 0 12px #22d3ee;
  }
  .universe-controls .el-button {
    margin: 0;
    color: #a5b4fc;
    background: rgba(30, 41, 59, 0.58);
    border-color: rgba(129, 140, 248, 0.18);
  }
  .universe-controls .el-button:hover {
    color: #e0f2fe;
    background: rgba(67, 56, 202, 0.32);
    border-color: rgba(103, 232, 249, 0.38);
  }
  .universe-canvas-wrap {
    position: relative;
    flex: 1;
    min-height: 290px;
    overflow: hidden;
  }
  .universe-canvas {
    position: absolute;
    inset: 0;
    display: block;
    cursor: grab;
    touch-action: none;
  }
  .universe-canvas.dragging {
    cursor: grabbing;
  }
  .universe-vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    box-shadow: inset 0 0 90px rgba(0, 0, 0, 0.42);
  }
  .universe-help {
    position: absolute;
    right: 16px;
    bottom: 12px;
    left: 16px;
    color: rgba(165, 180, 252, 0.52);
    font-size: 11px;
    text-align: center;
    pointer-events: none;
  }
  .universe-hover-card {
    position: absolute;
    z-index: 3;
    width: 274px;
    padding: 14px;
    background: rgba(10, 15, 36, 0.9);
    border: 1px solid rgba(103, 232, 249, 0.22);
    border-radius: 12px;
    box-shadow: 0 16px 42px rgba(0, 0, 0, 0.38);
    backdrop-filter: blur(16px);
    pointer-events: none;
  }
  .universe-hover-type {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    color: #a5b4fc;
    font-size: 11px;
  }
  .universe-hover-type > span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .universe-hover-type small {
    margin-left: auto;
    color: #64748b;
  }
  .universe-hover-card > strong {
    display: block;
    overflow: hidden;
    color: #f8fafc;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .universe-hover-card p {
    display: -webkit-box;
    margin: 7px 0;
    overflow: hidden;
    color: #94a3b8;
    font-size: 12px;
    line-height: 1.55;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .universe-hover-topic {
    overflow: hidden;
    color: #67e8f9;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .universe-legend {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px 16px;
    flex-wrap: wrap;
    padding: 10px 14px 12px;
    background: rgba(5, 8, 22, 0.88);
    border-top: 1px solid rgba(129, 140, 248, 0.12);
  }
  .universe-legend span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #94a3b8;
    font-size: 10px;
  }
  .universe-legend i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    box-shadow: 0 0 7px currentColor;
  }
  .universe-unavailable {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 30px;
    color: #fda4af;
    text-align: center;
  }
  @media (max-width: 760px) {
    .universe-topbar {
      align-items: flex-start;
      flex-direction: column;
    }
    .universe-controls {
      width: 100%;
      flex-wrap: wrap;
    }
  }
</style>
