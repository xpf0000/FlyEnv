import { HandleItemType, Shape, ShapeItemTypeType } from './Shape'
import type { Point } from './Shape'
import { CapturerStore } from '@/capturer/store/app'

export class Draw extends Shape {
  /**
   * 组成线的点
   */
  drawPoints: Point[] = []
  // 离屏画布相关属性
  private offScreenCanvas: HTMLCanvasElement | null = null
  private offScreenCtx: CanvasRenderingContext2D | null = null

  private offScreenHandleCanvas: HTMLCanvasElement | null = null
  private offScreenHandleCtx: CanvasRenderingContext2D | null = null

  private beginPoint: Point = {
    x: 0,
    y: 0
  }

  historyRedo(record: Draw) {
    super.historyRedo(record)
    this.beginPoint = record.beginPoint
    this.drawToOffScreen()
    this.draw()
  }

  destroy() {
    super.destroy()
    this.drawPoints.splice(0)
    this.offScreenCtx = null
    this.offScreenCanvas = null
    this.offScreenHandleCtx = null
    this.offScreenHandleCanvas = null
  }

  constructor(type: ShapeItemTypeType, startPoint: Point, strokeColor: string, toolWidth: number) {
    super(type, startPoint, strokeColor, toolWidth)
    this.beginPoint = { ...startPoint }
    this.drawPoints.push({
      ...this.startPoint
    })
    this.pathCache = new Path2D()
    this.pathCache.moveTo(startPoint.x, startPoint.y)
  }

  /**
   * 初始化离屏画布
   */
  private initOffScreen() {
    if (this.offScreenCanvas) return
    const mainCanvas = this.canvas!
    this.offScreenCanvas = document.createElement('canvas')
    this.offScreenCanvas.width = mainCanvas.width
    this.offScreenCanvas.height = mainCanvas.height
    this.offScreenCtx = this.offScreenCanvas.getContext('2d')!

    // 设置离屏画布的绘制样式
    this.offScreenCtx.lineCap = 'round'
    this.offScreenCtx.lineJoin = 'round'

    this.offScreenHandleCanvas = document.createElement('canvas')
    this.offScreenHandleCanvas.width = mainCanvas.width
    this.offScreenHandleCanvas.height = mainCanvas.height
    this.offScreenHandleCtx = this.offScreenHandleCanvas.getContext('2d')!

    // 设置离屏画布的绘制样式
    this.offScreenHandleCtx.lineCap = 'round'
    this.offScreenHandleCtx.lineJoin = 'round'
  }

  /**
   * 增量绘制到离屏画布
   */
  private drawToOffScreen() {
    if (!this.offScreenCtx || !this.drawPoints.length) return

    const color = this.strokeColor
    const lineWidth = this.getStrokeWidth()

    const ctx = this.offScreenCtx
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.stroke(this.pathCache!)
    ctx.restore()

    const ctxHandle = this.offScreenHandleCtx!
    ctxHandle.save()
    ctxHandle.strokeStyle = color
    ctxHandle.lineWidth = lineWidth
    ctxHandle.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctxHandle.stroke(this.pathCache!)
    ctxHandle.strokeStyle = '#333333'
    ctxHandle.lineWidth = CapturerStore().scaleFactor
    ctxHandle.stroke(this.pathCache!)
    ctxHandle.restore()
  }

  update(endPoint: Point) {
    // 初始化离屏画布
    this.initOffScreen()
    this.pathCache!.lineTo(endPoint.x, endPoint.y)
    this.drawPoints.push(endPoint)
    this.drawToOffScreen()
  }

  /**
   * 判断点是否在线上
   * @param x
   * @param y
   */
  isOnBorder(x: number, y: number): boolean {
    // 1. 如果没有生成点（还未绘制），直接返回 false
    if (!this.drawPoints.length) return false
    const store = CapturerStore()
    const threshold = this.getStrokeWidth() / 2 + 2 * store.scaleFactor
    // 2. 简单的包围盒检测（AABB），快速排除大部分情况，提高性能
    const xs = this.drawPoints.map((p) => p.x)
    const ys = this.drawPoints.map((p) => p.y)
    const diffX = this.startPoint.x - this.beginPoint.x
    const diffY = this.startPoint.y - this.beginPoint.y
    const minX = Math.min(...xs) + diffX - threshold
    const maxX = Math.max(...xs) + diffX + threshold
    const minY = Math.min(...ys) + diffY - threshold
    const maxY = Math.max(...ys) + diffY + threshold

    if (x < minX || x > maxX || y < minY || y > maxY) {
      return false
    }

    /**
     * 再根据drawPoints判断
     */
    if (!this.pathCache) {
      return false
    }
    const ctx = this.canvasCtx!
    ctx.save()
    ctx.lineWidth = this.getStrokeWidth() + 2 * store.scaleFactor
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.translate(this.startPoint.x - this.beginPoint.x, this.startPoint.y - this.beginPoint.y)
    // 利用原生 API 判定点是否在路径的描边范围内
    const isHit = ctx.isPointInStroke(this.pathCache, x, y)
    ctx.restore()

    return isHit
  }

  isOnShape(x: number, y: number): boolean {
    return x < 0 || y < 0
  }

  getHandles(): HandleItemType[] {
    return []
  }

  resizeStart(handle: HandleItemType) {
    this.handle = handle
  }

  resize(p: Point) {
    if (p) {
      return
    }
  }

  /**
   * 获取设置值对应的宽度
   * @private
   */
  private getStrokeWidth() {
    const store = CapturerStore()
    const widths: any = {
      5: 2,
      10: 6,
      20: 10
    }
    return widths[this.toolWidth] * store.scaleFactor
  }

  onToolWidthChanged() {
    this.drawToOffScreen()
  }

  onStrokeColorChanged() {
    this.drawToOffScreen()
  }

  reDraw() {}

  onMove() {}

  /**
   * 绘制线
   */
  draw() {
    if (!this.drawPoints.length || !this.offScreenCanvas) return

    const ctx = this.canvasCtx!
    if (!ctx) return

    ctx.save()
    ctx.clearRect(0, 0, this.canvas!.width, this.canvas!.height)
    ctx.translate(this.startPoint.x - this.beginPoint.x, this.startPoint.y - this.beginPoint.y)
    // 绘制离屏画布内容
    if (this.showHandle) {
      ctx.drawImage(this.offScreenHandleCanvas!, 0, 0)
    } else {
      ctx.drawImage(this.offScreenCanvas, 0, 0)
    }

    ctx.restore()
  }
}
