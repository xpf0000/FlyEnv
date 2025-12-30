import { Shape } from './Shape'
import type { Point } from './Shape'
import { CapturerStore, ScreenStore } from '@/capturer/store/app'

export class Mask extends Shape {
  maskType: 'area' | 'hand' = 'area'
  drawPoints: Point[] = []

  // 1. 定义离屏画布及其 Context
  private offScreenCanvas: HTMLCanvasElement | null = null
  private offScreenCtx: CanvasRenderingContext2D | null = null
  /**
   * 初始化离屏画布
   * 尺寸应与主画布一致，用于绘制纯黑色的“路径遮罩”
   */
  private initOffScreen() {
    if (this.offScreenCanvas) return
    const mainCanvas = ScreenStore.rectCanvas!
    this.offScreenCanvas = document.createElement('canvas')
    this.offScreenCanvas.width = mainCanvas.width
    this.offScreenCanvas.height = mainCanvas.height
    this.offScreenCtx = this.offScreenCanvas.getContext('2d')!

    // 初始化配置，只需设置一次
    this.offScreenCtx.lineCap = 'round'
    this.offScreenCtx.lineJoin = 'round'
  }

  /**
   * 增量绘制到离屏画布
   */
  private drawToOffScreen() {
    if (!this.offScreenCtx) return
    const pattern = ScreenStore.mosaicPattern
    if (!pattern) {
      return
    }

    const ctx = this.offScreenCtx
    ctx.save()

    if (this.maskType === 'area') {
      if (!this.showHandle) {
        const x = Math.min(this.startPoint.x, this.endPoint.x)
        const y = Math.min(this.startPoint.y, this.endPoint.y)
        const width = Math.abs(this.startPoint.x - this.endPoint.x)
        const height = Math.abs(this.startPoint.y - this.endPoint.y)
        ctx.fillStyle = pattern
        ctx.fillRect(x, y, width, height)
      }
    } else {
      /**
       * 【优化】手画线模式：使用离屏画布作为 Pattern 遮罩
       */
      if (this.drawPoints.length < 2 || !this.offScreenCanvas) {
        ctx.restore()
        return
      }

      const tCtx = this.offScreenCtx!
      // 2. 清空临时画布（关键：必须是透明的）
      tCtx.clearRect(0, 0, tCtx.canvas.width, tCtx.canvas.height)
      tCtx.strokeStyle = '#000000' // 颜色不重要，因为我们只需要它的形状
      tCtx.lineWidth = this.getStrokeWidth()
      tCtx.stroke(this.pathCache!)
      // B: 设置合成模式，只在有笔迹的地方显示马赛克
      tCtx.globalCompositeOperation = 'source-in'
      tCtx.fillStyle = pattern
      tCtx.fillRect(0, 0, tCtx.canvas.width, tCtx.canvas.height)
      tCtx.globalCompositeOperation = 'source-over' // 重置
    }

    ctx.restore()
  }

  update(endPoint: Point) {
    this.initOffScreen()
    if (this.maskType === 'area') {
      this.endPoint = endPoint
      this.drawToOffScreen()
    } else {
      const lastPoint = this.drawPoints?.[this.drawPoints.length - 1]

      // 距离过滤：减少不必要的计算
      if (!lastPoint || Math.hypot(endPoint.x - lastPoint.x, endPoint.y - lastPoint.y) > 2) {
        this.drawPoints.push(endPoint)

        if (!this.pathCache) {
          // 第一次绘制：创建路径对象
          this.pathCache = new Path2D()
          this.pathCache.moveTo(endPoint.x, endPoint.y)
        } else {
          // 增量绘制：将新增的点添加到路径
          this.pathCache!.lineTo(endPoint.x, endPoint.y)
          this.drawToOffScreen()
        }
      }
    }
  }

  isOnBorder(x: number, y: number): boolean {
    if (x < 0 && y < 0) {
      return false
    }
    return false
  }

  isOnShape(x: number, y: number): boolean {
    return x < 0 && y < 0
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
      5: 12,
      10: 24,
      20: 36
    }
    return widths[this.toolWidth] * store.scaleFactor
  }

  reDraw() {
    this.drawToOffScreen()
  }

  draw() {
    const ctx = ScreenStore.rectCtx!
    if (!ctx) return
    ctx.save()

    if (this.maskType === 'area') {
      // ... 区域模式逻辑保持不变
      const x = Math.min(this.startPoint.x, this.endPoint.x)
      const y = Math.min(this.startPoint.y, this.endPoint.y)
      const width = Math.abs(this.startPoint.x - this.endPoint.x)
      const height = Math.abs(this.startPoint.y - this.endPoint.y)

      if (this.showHandle) {
        ctx.strokeStyle = '#409EFF'
        ctx.lineWidth = 2 * CapturerStore().scaleFactor
        ctx.beginPath()
        ctx.rect(x, y, width, height)
        ctx.stroke()
      } else {
        if (!this.offScreenCanvas) {
          ctx.restore()
          return
        }
        ctx.drawImage(this.offScreenCanvas, 0, 0)
      }
    } else {
      if (this.drawPoints.length < 2 || !this.offScreenCanvas) {
        ctx.restore()
        return
      }
      ctx.drawImage(this.offScreenCanvas, 0, 0)
    }

    ctx.restore()
  }
}
