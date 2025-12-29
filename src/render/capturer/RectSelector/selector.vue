<template>
  <div
    v-if="RectSelect.editRect"
    class="selector"
    :style="style"
    @mousedown.stop="handleMouseDown($event, 'move')"
  >
    <RectCanvas />
    <template v-if="RectCanvasStore.shape.length === 0">
      <div class="ctrl top-left" @mousedown.stop="handleMouseDown($event, 'tl')"></div>
      <div class="ctrl top-center" @mousedown.stop="handleMouseDown($event, 'tc')"></div>
      <div class="ctrl top-right" @mousedown.stop="handleMouseDown($event, 'tr')"></div>
      <div class="ctrl center-left" @mousedown.stop="handleMouseDown($event, 'cl')"></div>
      <div class="ctrl center-right" @mousedown.stop="handleMouseDown($event, 'cr')"></div>
      <div class="ctrl bottom-left" @mousedown.stop="handleMouseDown($event, 'bl')"></div>
      <div class="ctrl bottom-center" @mousedown.stop="handleMouseDown($event, 'bc')"></div>
      <div class="ctrl bottom-right" @mousedown.stop="handleMouseDown($event, 'br')"></div>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, reactive } from 'vue'
  import { CapturerStore } from '@/capturer/store/app'
  import RectSelect from '@/capturer/RectSelector/RectSelect'
  import CapturerTool from '@/capturer/tools/tools'
  import RectCanvas from '@/capturer/RectCanvas/index.vue'
  import RectCanvasStore from '@/capturer/RectCanvas/RectCanvas'

  const store = CapturerStore()

  // 为了方便计算，定义一个简单的类型
  type Direction = 'tl' | 'tc' | 'tr' | 'cl' | 'cr' | 'bl' | 'bc' | 'br' | 'move'

  // 1. 获取当前矩形数据
  const rect = computed(() => RectSelect?.editRect || { x: 0, y: 0, width: 0, height: 0 })

  // 2. 样式绑定
  const style = computed(() => {
    const obj: any = {
      left: `${rect.value.x}px`,
      top: `${rect.value.y}px`,
      width: `${rect.value.width}px`,
      height: `${rect.value.height}px`,
      // 移动模式下显示移动光标
      cursor: 'move'
    }
    if (RectCanvasStore.shape.length > 0 || !!CapturerTool.tool) {
      delete obj?.cursor
    }
    return obj
  })

  // --- 拖拽核心逻辑 ---

  let isDragging = false
  let startX = 0
  let startY = 0
  let initialRect = { x: 0, y: 0, width: 0, height: 0 }
  let currentDirection: Direction | null = null

  // 容器边界 (假设全屏，如果是特定容器，请替换为 container.clientWidth/Height)
  const getBounds = () => ({
    width: window.innerWidth,
    height: window.innerHeight
  })

  const handleMouseDown = (e: MouseEvent, dir: Direction) => {
    if (RectCanvasStore.shape.length > 0 || !!CapturerTool.tool) {
      return
    }
    e.preventDefault() // 防止选中文字
    CapturerTool.updatePosition()
    isDragging = true
    startX = e.clientX
    startY = e.clientY

    if (dir !== 'move') {
      store.magnifyingInfo.show = true
      store.onWindowMouseMove(e)
    }

    currentDirection = dir

    // 保存初始状态，避免直接依赖响应式对象在拖拽中的变化
    initialRect = { ...rect.value }

    // 绑定全局事件，保证鼠标移出元素也能响应
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !currentDirection) return

    const bounds = getBounds()
    const { x, y, width, height } = initialRect

    // 1. 计算当前的鼠标位置的 Delta (变化量)
    const dx = e.clientX - startX
    const dy = e.clientY - startY

    // 2. 根据操作类型计算新的坐标
    // 我们使用 temp 对象来计算 "预期的" 左、顶、右、底 坐标
    // 这样可以统一处理翻转逻辑
    let newLeft = x
    let newTop = y
    let newRight = x + width
    let newBottom = y + height

    // 逻辑分支：移动 vs 改变大小
    if (currentDirection === 'move') {
      // --- 移动逻辑 ---
      newLeft += dx
      newTop += dy

      // 移动时的边界检查 (防止移出屏幕)
      if (newLeft < 0) newLeft = 0
      if (newTop < 0) newTop = 0
      if (newLeft + width > bounds.width) newLeft = bounds.width - width
      if (newTop + height > bounds.height) newTop = bounds.height - height

      newRight = newLeft + width
      newBottom = newTop + height
    } else {
      // --- 缩放逻辑 ---

      // 辅助函数：根据方向限制鼠标坐标在边界内
      const clientX = Math.min(Math.max(e.clientX, 0), bounds.width)
      const clientY = Math.min(Math.max(e.clientY, 0), bounds.height)

      // 根据手柄方向，更新对应的边
      // 注意：这里我们直接用鼠标的绝对位置来替代原来的边，这样天然支持翻转
      if (currentDirection.includes('l')) newLeft = clientX // 左边动
      if (currentDirection.includes('r')) newRight = clientX // 右边动
      if (currentDirection.includes('t')) newTop = clientY // 顶边动
      if (currentDirection.includes('b')) newBottom = clientY // 底边动
    }

    // 3. 翻转归一化 (Normalization)
    // 如果 newLeft > newRight，说明翻转了，交换数值即可
    // 这种写法同时解决了 "拖过头" 和 "边界限制" 的问题
    const finalX = Math.min(newLeft, newRight)
    const finalY = Math.min(newTop, newBottom)
    const finalW = Math.abs(newRight - newLeft)
    const finalH = Math.abs(newBottom - newTop)

    // 4. 更新 Store
    // 注意：这里建议在 store 中加一个 action 如 updateRect，或者直接赋值
    RectSelect.editRect = reactive({
      x: finalX,
      y: finalY,
      width: finalW,
      height: finalH
    })
  }

  const handleMouseUp = () => {
    store.magnifyingInfo.show = false
    isDragging = false
    currentDirection = null
    CapturerTool.updatePosition(RectSelect.editRect)
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
  }

  // 组件卸载时确保清除事件
  onBeforeUnmount(() => {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
  })
</script>

<style lang="scss" scoped>
  .selector {
    position: absolute;
    z-index: 100;
    /* 禁用默认的触摸操作，防止移动端滚动 */
    touch-action: none;
    box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.4);

    &:after {
      content: '';
      position: absolute;
      inset: 0;
      border: 2px solid #409eff;
      z-index: 120;
      /* 让中间区域可以透过点击（如果需要选中内部元素）*/
      pointer-events: none;
    }

    /* 定义控制点的大小 */
    $ctrl-size: 8px;
    $ctrl-offset: -4px; /* size / 2 * -1 */

    .ctrl {
      position: absolute;
      width: $ctrl-size;
      height: $ctrl-size;
      background: #fff;
      border: 1px solid #409eff;
      border-radius: 50%;
      z-index: 130;
      box-sizing: border-box;
    }

    /* 位置与光标样式定义 */
    .top-left {
      top: $ctrl-offset;
      left: $ctrl-offset;
      cursor: nwse-resize;
    }
    .top-center {
      top: $ctrl-offset;
      left: 50%;
      transform: translateX(-50%);
      cursor: ns-resize;
    }
    .top-right {
      top: $ctrl-offset;
      right: $ctrl-offset;
      cursor: nesw-resize;
    }
    .center-left {
      top: 50%;
      left: $ctrl-offset;
      transform: translateY(-50%);
      cursor: ew-resize;
    }
    .center-right {
      top: 50%;
      right: $ctrl-offset;
      transform: translateY(-50%);
      cursor: ew-resize;
    }
    .bottom-left {
      bottom: $ctrl-offset;
      left: $ctrl-offset;
      cursor: nesw-resize;
    }
    .bottom-center {
      bottom: $ctrl-offset;
      left: 50%;
      transform: translateX(-50%);
      cursor: ns-resize;
    }
    .bottom-right {
      bottom: $ctrl-offset;
      right: $ctrl-offset;
      cursor: nwse-resize;
    }
  }
</style>
