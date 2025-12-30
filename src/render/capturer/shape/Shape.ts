import { CapturerStore, ScreenStore } from '@/capturer/store/app'
import CapurerTool from '@/capturer/tools/tools'

type ShapeItemTypeType = 'square' | 'circle' | 'arrow' | 'draw' | 'mask' | 'text' | 'tag'
export type Point = {
  x: number
  y: number
}

export type HandleItemType = {
  x: number
  y: number
  cursor: 'nwse-resize' | 'ns-resize' | 'nesw-resize' | 'ew-resize' | 'auto'
  position:
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right'
    | 'top-center'
    | 'bottom-center'
    | 'left-center'
    | 'right-center'
    | 'start'
    | 'end'
}

export class Shape {
  type: ShapeItemTypeType = 'square'
  startPoint: Point = {
    x: 0,
    y: 0
  }
  endPoint: Point = {
    x: 0,
    y: 0
  }
  strokeColor: string = ''
  strokeWidth: number = 1
  toolWidth: number = 0
  showHandle: boolean = false
  handle?: HandleItemType
  handles?: HandleItemType[]
  width: number = 0
  height: number = 0
  pathCache?: Path2D | null = undefined // 缓存路径对象

  constructor(type: ShapeItemTypeType, startPoint: Point, strokeColor: string, toolWidth: number) {
    this.type = type
    this.startPoint = startPoint
    this.strokeColor = strokeColor
    this.toolWidth = toolWidth
  }

  onMove() {}

  /**
   * 更新鼠标移动的点
   * 根据起点和终点, 自动计算宽高路径
   * @param endPoint
   */
  update(endPoint: Point) {
    this.endPoint = endPoint
    this.pathCache = null
  }

  isOnShape(x: number, y: number): boolean {
    if (!this.width || !this.height) {
      return false
    }
    const minX = this.startPoint.x
    const minY = this.startPoint.y
    const maxX = minX + this.width
    const maxY = minY + this.height
    const out = x < minX || x > maxX || y < minY || y > maxY
    return !out
  }

  isOnBorder(x: number, y: number) {
    return x < 0 && y < 0
  }

  getHandles(): HandleItemType[] {
    return []
  }

  resizeStart(handle: HandleItemType) {
    this.handle = handle
  }

  resize(point: Point) {
    if (point) {
      return
    }
  }

  deSelect() {
    this.showHandle = false
    this.reDraw()
  }

  select() {
    this.showHandle = true
    this.reDraw()
    if (this.type === 'square') {
      CapurerTool.tool = 'square'
      CapurerTool.square.width = this.toolWidth
      CapurerTool.square.color = this.strokeColor
    } else if (this.type === 'circle') {
      CapurerTool.tool = 'circle'
      CapurerTool.circle.width = this.toolWidth
      CapurerTool.circle.color = this.strokeColor
    } else if (this.type === 'arrow') {
      CapurerTool.tool = 'arrow'
      CapurerTool.arrow.width = this.toolWidth
      CapurerTool.arrow.color = this.strokeColor
    } else if (this.type === 'draw') {
      CapurerTool.tool = 'draw'
      CapurerTool.arrow.width = this.toolWidth
      CapurerTool.arrow.color = this.strokeColor
    }
  }

  reDraw() {}

  draw() {
    const store = CapturerStore()
    const ctx = ScreenStore.rectCtx!
    if (this.showHandle) {
      // ctx.imageSmoothingEnabled = true
      // 绘制控制点
      ctx.fillStyle = '#FFFFFF'
      ctx.strokeStyle = '#333333'
      ctx.lineWidth = 1 * store.scaleFactor
      const handles = this.getHandles()

      const radius = 3 * store.scaleFactor
      ctx.beginPath()
      handles.forEach((handle) => {
        // 必须用 moveTo 分隔每个圆形
        ctx.moveTo(handle.x + radius, handle.y)
        ctx.arc(handle.x, handle.y, radius, 0, Math.PI * 2)
      })
      // 一次性操作
      ctx.fill()
      ctx.stroke()
    }
  }
}
