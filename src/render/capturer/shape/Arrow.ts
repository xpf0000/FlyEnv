import { HandleItemType, Shape } from './Shape'
import type { Point } from './Shape'
import { CapturerStore, ScreenStore } from '@/capturer/store/app'

export class Arrow extends Shape {
  /**
   * 组成箭头的点, 检测点是否在箭头图形内需要用
   * 可以在绘制时计算写入
   */
  arrowPoints: Point[] = []

  isOnBorder(x: number, y: number): boolean {
    return x < 0 && y < 0
  }

  /**
   * 判断点是否在箭头图形内
   * 使用射线法 (Ray Casting Algorithm) 判断点是否在多边形内
   */
  isOnShape(x: number, y: number): boolean {
    // 1. 如果没有生成点（还未绘制），直接返回 false
    if (this.arrowPoints.length < 3) return false

    // 2. 简单的包围盒检测（AABB），快速排除大部分情况，提高性能
    const xs = this.arrowPoints.map((p) => p.x)
    const ys = this.arrowPoints.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    if (x < minX || x > maxX || y < minY || y > maxY) {
      return false
    }

    // 3. 射线法核心算法
    let inside = false
    for (let i = 0, j = this.arrowPoints.length - 1; i < this.arrowPoints.length; j = i++) {
      const xi = this.arrowPoints[i].x
      const yi = this.arrowPoints[i].y
      const xj = this.arrowPoints[j].x
      const yj = this.arrowPoints[j].y

      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
      if (intersect) inside = !inside
    }

    return inside
  }

  /**
   * 返回控制点
   */
  getHandles(): HandleItemType[] {
    const handlerPoints: Record<string, HandleItemType> = {
      start: {
        x: this.startPoint.x,
        y: this.startPoint.y,
        cursor: 'auto',
        position: 'start'
      },
      end: {
        x: this.endPoint.x,
        y: this.endPoint.y,
        cursor: 'auto',
        position: 'end'
      }
    }

    this.handles = Object.values(handlerPoints)
    // 注意：这里的顺序必须和 resize 中判断的顺序逻辑一致，或者 resize 中通过坐标距离判断
    return this.handles
  }

  resizeStart(handle: HandleItemType) {
    this.handle = handle
  }

  resize({ x, y }: Point) {
    switch (this.handle?.position) {
      case 'start':
        this.startPoint.x = x
        this.startPoint.y = y
        break
      case 'end':
        this.endPoint.x = x
        this.endPoint.y = y
        break
    }
  }

  /**
   * 获取设置值对应的宽度
   * @private
   */
  private getStrokeWidth() {
    const store = CapturerStore()
    const widths: any = {
      5: 8,
      10: 12,
      20: 16
    }
    return widths[this.toolWidth] * store.scaleFactor
  }

  /**
   * 绘制箭头
   */
  draw() {
    const x1 = this.startPoint.x
    const y1 = this.startPoint.y
    const x2 = this.endPoint.x
    const y2 = this.endPoint.y
    const color = this.strokeColor

    const ctx = ScreenStore.rectCtx!
    // 【关键点 1】禁用平滑处理，产生像素颗粒感
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = color

    // --- 1. 计算几何参数 ---
    const dx = x2 - x1
    const dy = y2 - y1
    const dist = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)

    // 获取配置的基础宽度 (例如: 2, 5, 9)
    const baseWidth = this.getStrokeWidth()

    // 动态宽度逻辑：距离越远越粗，直到达到上限
    // 这里我们将 baseWidth 视为“最大宽度”的基准，通过距离来衰减
    const range = 300
    const minWidthFactor = 0.3 // 最小是 baseWidth 的 0.5 倍

    // 计算当前的宽度系数 (0.5 ~ 1.0)
    const growth = Math.min(dist / range, 1) // 0 -> 1
    // 如果距离很短，宽度稍微细一点；距离长，用足 baseWidth
    const currentShaftWidth = baseWidth * (minWidthFactor + (1 - minWidthFactor) * growth)

    // 箭头各部分比例
    const headLength = currentShaftWidth * 4 // 箭头尖的长度
    const headWingWidth = currentShaftWidth * 3 // 箭头两侧翅膀的总宽度的一半 (或者相对于杆的倍数)
    const neckWidth = currentShaftWidth / 1.5 // 杆的一半宽度
    const footWidth = currentShaftWidth / 3.5 // 杆的一半宽度

    // 修正：如果距离太短，箭头尖不能超过总长度
    const actualHeadLen = dist < headLength ? dist : headLength
    const shaftLen = dist - actualHeadLen

    // --- 更新用于碰撞检测的点 arrowPoints ---
    // 为了让射线法准确，我们在半圆尾部手动进行采样（5个点即可模拟弧度）
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)

    const getWPoint = (lx: number, ly: number) => ({
      x: lx * cos - ly * sin + x1,
      y: lx * sin + ly * cos + y1
    })

    this.arrowPoints = [
      // 1. 尾部半圆采样（从 -90度 到 90度，相对于旋转后的坐标系）
      getWPoint(0, -neckWidth),
      getWPoint(-neckWidth * 0.5, -neckWidth * 0.8), // 弧形插值点
      getWPoint(-neckWidth, 0), // 圆弧最左侧
      getWPoint(-neckWidth * 0.5, neckWidth * 0.8), // 弧形插值点
      getWPoint(0, neckWidth),
      // 2. 颈部下
      getWPoint(shaftLen, neckWidth),
      // 3. 翅膀下
      getWPoint(shaftLen, headWingWidth / 2),
      // 4. 尖端
      getWPoint(dist, 0),
      // 5. 翅膀上
      getWPoint(shaftLen, -headWingWidth / 2),
      // 6. 颈部上
      getWPoint(shaftLen, -neckWidth)
    ]

    // --- 开始绘制 ---
    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = color
    ctx.translate(x1, y1)
    ctx.rotate(angle)

    ctx.beginPath()
    // 绘制半圆尾部：圆心在 (0,0), 半径为 neckWidth, 从 PI/2 到 -PI/2 (逆时针)
    ctx.arc(0 + footWidth, 0, footWidth, Math.PI / 2, -Math.PI / 2, false)

    // 绘制箭杆和箭头
    ctx.lineTo(shaftLen, -neckWidth)
    ctx.lineTo(shaftLen - footWidth, -headWingWidth / 2 - footWidth)
    ctx.lineTo(dist, 0)
    ctx.lineTo(shaftLen - footWidth, headWingWidth / 2 + footWidth)
    ctx.lineTo(shaftLen, neckWidth)

    ctx.closePath()
    ctx.fill()
    ctx.restore()

    if (this.showHandle) {
      this.drawHandles(ctx)
    }
  }

  /**
   * 抽离控制点绘制逻辑，保持代码整洁
   */
  private drawHandles(ctx: CanvasRenderingContext2D) {
    const store = CapturerStore()
    ctx.fillStyle = '#FFFFFF'
    ctx.strokeStyle = '#333333'
    ctx.lineWidth = 1 * store.scaleFactor

    const handles = this.getHandles()
    const radius = 3 * store.scaleFactor

    // 开始新的 path 防止干扰箭头本身
    ctx.beginPath()
    handles.forEach((handle) => {
      ctx.moveTo(handle.x + radius, handle.y)
      ctx.arc(handle.x, handle.y, radius, 0, Math.PI * 2)
    })
    ctx.fill()
    ctx.stroke()
  }
}
