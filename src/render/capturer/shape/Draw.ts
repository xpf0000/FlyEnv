import { HandleItemType, Shape } from './Shape'
import type { Point } from './Shape'
import { CapturerStore, ScreenStore } from '@/capturer/store/app'

export class Draw extends Shape {
  /**
   * 组成线的点
   */
  drawPoints: Point[] = []
  // 离屏画布相关属性
  private offScreenCanvas: HTMLCanvasElement | null = null
  private offScreenCtx: CanvasRenderingContext2D | null = null

  constructor(...args: any[]) {
    super(...args)
    this.drawPoints.push({
      ...this.startPoint
    })
  }

  /**
   * 初始化离屏画布
   */
  private initOffScreen() {
    if (this.offScreenCanvas) return
    const mainCanvas = ScreenStore.rectCanvas!
    this.offScreenCanvas = document.createElement('canvas')
    this.offScreenCanvas.width = mainCanvas.width
    this.offScreenCanvas.height = mainCanvas.height
    this.offScreenCtx = this.offScreenCanvas.getContext('2d')!

    // 设置离屏画布的绘制样式
    this.offScreenCtx.lineCap = 'round'
    this.offScreenCtx.lineJoin = 'round'
  }

  /**
   * 增量绘制到离屏画布
   */
  private drawToOffScreen() {
    if (!this.offScreenCtx || !this.drawPoints.length) return

    const ctx = this.offScreenCtx
    const color = this.strokeColor
    const lineWidth = this.getStrokeWidth()

    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth

    // 重新绘制所有点
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.translate(this.startPoint.x, this.startPoint.y)
    ctx.stroke(this.pathCache!)
    if (this.showHandle) {
      ctx.strokeStyle = '#333333'
      ctx.lineWidth = CapturerStore().scaleFactor
      ctx.stroke(this.pathCache!)
    }

    ctx.restore()
  }

  update(endPoint: Point) {
    const relativePoint = {
      x: endPoint.x - this.startPoint.x,
      y: endPoint.y - this.startPoint.y
    }
    // 初始化离屏画布
    this.initOffScreen()

    if (!this.pathCache) {
      // 第一次绘制：创建路径对象
      this.pathCache = new Path2D()
      this.pathCache.moveTo(relativePoint.x, relativePoint.y)

      // 重置离屏画布
      this.offScreenCtx!.clearRect(
        0,
        0,
        this.offScreenCtx!.canvas.width,
        this.offScreenCtx!.canvas.height
      )
    } else {
      // 增量绘制：将新增的点添加到路径
      this.pathCache!.lineTo(relativePoint.x, relativePoint.y)
    }

    this.drawPoints.push(relativePoint)
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
    const minX = Math.min(...xs) + this.startPoint.x - threshold
    const maxX = Math.max(...xs) + this.startPoint.x + threshold
    const minY = Math.min(...ys) + this.startPoint.y - threshold
    const maxY = Math.max(...ys) + this.startPoint.y + threshold

    if (x < minX || x > maxX || y < minY || y > maxY) {
      return false
    }

    /**
     * 再根据drawPoints判断
     */
    if (!this.pathCache) {
      return false
    }
    const ctx = ScreenStore.rectCtx!
    ctx.save()
    ctx.lineWidth = this.getStrokeWidth() + 2 * store.scaleFactor
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.translate(this.startPoint.x, this.startPoint.y)
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

  reDraw() {
    this.drawToOffScreen()
  }

  onMove() {
    this.drawToOffScreen()
  }

  /**
   * 绘制线
   */
  draw() {
    if (!this.drawPoints.length || !this.offScreenCanvas) return

    const ctx = ScreenStore.rectCtx!
    if (!ctx) return

    ctx.save()

    // 绘制离屏画布内容
    ctx.drawImage(this.offScreenCanvas, 0, 0)

    ctx.restore()
  }
}
