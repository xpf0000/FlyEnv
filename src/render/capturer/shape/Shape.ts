import { CapturerStore, ScreenStore } from '@/capturer/store/app'

type ShapeItemTypeType = 'square' | 'circle' | 'arrow' | 'draw' | 'mask' | 'text' | 'tag'
export type Point = {
  x: number
  y: number
}

export type HandleItemType = {
  x: number
  y: number
  cursor: 'nwse-resize' | 'ns-resize' | 'nesw-resize' | 'ew-resize'
}

type ShapeHandleType = {
  // 调整开始时, Shape的起点
  startPoint: Point
  // 调整开始时, Shape的终点
  endPoint: Point
  // 调整开始点
  handleStartPoint: Point
  // 调整结束点
  handleEndPoint: Point
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
  handle?: ShapeHandleType
  handles?: HandleItemType[]
  width: number
  height: number

  constructor(type: ShapeItemTypeType, startPoint: Point, strokeColor: string, toolWidth: number) {
    this.type = type
    this.startPoint = startPoint
    this.strokeColor = strokeColor
    this.toolWidth = toolWidth
  }

  /**
   * 更新鼠标移动的点
   * 根据起点和终点, 自动计算宽高路径
   * @param endPoint
   */
  update(endPoint: Point) {
    this.endPoint = endPoint
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
    return x > y
  }

  getHandles(): HandleItemType[] {
    return []
  }

  resize(handleEndPoint: HandleItemType) {
    if (handleEndPoint) {
      return
    }
  }

  draw() {
    const store = CapturerStore()
    const ctx = ScreenStore.rectCtx
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
