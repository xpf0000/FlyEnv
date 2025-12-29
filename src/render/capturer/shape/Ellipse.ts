import { HandleItemType, Shape } from './Shape'
import type { Point } from './Shape'
import { CapturerStore, ScreenStore } from '@/capturer/store/app'

export class Ellipse extends Shape {
  /**
   * 判断点是否在椭圆边框线上
   */
  isOnBorder(x: number, y: number): boolean {
    const startX = Math.min(this.startPoint.x, this.endPoint.x)
    const startY = Math.min(this.startPoint.y, this.endPoint.y)
    const width = Math.abs(this.startPoint.x - this.endPoint.x)
    const height = Math.abs(this.startPoint.y - this.endPoint.y)

    /**
     * 半径
     */
    const radiusX = width * 0.5
    const radiusY = height * 0.5

    /**
     * 中心点
     */
    const centerX = startX + radiusX
    const centerY = startY + radiusY

    const store = CapturerStore()
    /**
     * 椭圆边框宽度的一半, 用于判断点是否在边框上 (阈值)
     */
    const borderThreshold = (this.getStrokeWidth() + 2 * store.scaleFactor) * 0.5

    // --- 以下是补全的逻辑 ---

    // 1. 将坐标归一化：计算点相对于椭圆中心的偏移量
    const dx = x - centerX
    const dy = y - centerY

    // 2. 定义外椭圆半径 (原半径 + 阈值)
    // 如果点在这个椭圆内，说明没超过边框最外沿
    const outerRx = radiusX + borderThreshold
    const outerRy = radiusY + borderThreshold

    // 使用椭圆方程 (x²/a² + y²/b² <= 1) 判断是否在外椭圆内
    // 为了避免除以0，这里假设 radius + threshold > 0
    const isInsideOuter = (dx * dx) / (outerRx * outerRx) + (dy * dy) / (outerRy * outerRy) <= 1

    if (!isInsideOuter) {
      return false // 如果已经在最外圈外面，直接返回 false
    }

    // 3. 定义内椭圆半径 (原半径 - 阈值)
    // 如果点在这个椭圆外，说明没超过边框最内沿
    const innerRx = radiusX - borderThreshold
    const innerRy = radiusY - borderThreshold

    // 4. 判断是否在内椭圆外
    // 特殊情况：如果内半径小于等于0（说明椭圆很小或者线很粗，中间没有空心），
    // 那么只要在外椭圆内就算选中，不需要判断内圆。
    let isOutsideInner = true

    if (innerRx > 0 && innerRy > 0) {
      // 必须大于等于1才算在内圈外面
      isOutsideInner = (dx * dx) / (innerRx * innerRx) + (dy * dy) / (innerRy * innerRy) >= 1
    }

    // 最终结果：在外椭圆内 且 在内椭圆外
    return isInsideOuter && isOutsideInner
  }

  /**
   * 返回控制点
   */
  getHandles(): HandleItemType[] {
    const width = Math.abs(this.startPoint.x - this.endPoint.x)
    const height = Math.abs(this.startPoint.y - this.endPoint.y)

    // 为了确保控制点逻辑与resize匹配，这里需要基于原始坐标而非排序后的坐标
    // 但通常绘制控制点希望基于视觉上的 TopLeft, TopRight 等
    // 这里保持你原有的逻辑，基于 startPoint 和 endPoint 的原始值

    // 辅助计算中心
    const minX = Math.min(this.startPoint.x, this.endPoint.x)
    const minY = Math.min(this.startPoint.y, this.endPoint.y)
    const maxX = Math.max(this.startPoint.x, this.endPoint.x)
    const maxY = Math.max(this.startPoint.y, this.endPoint.y)
    const midX = minX + width / 2
    const midY = minY + height / 2

    const handlerPoints: Record<string, HandleItemType> = {
      topLeft: {
        x: minX,
        y: minY,
        cursor: 'nwse-resize',
        position: 'top-left'
      },
      topRight: {
        x: maxX,
        y: minY,
        cursor: 'nesw-resize',
        position: 'top-right'
      },
      bottomLeft: {
        x: minX,
        y: maxY,
        cursor: 'nesw-resize',
        position: 'bottom-left'
      },
      bottomRight: {
        x: maxX,
        y: maxY,
        cursor: 'nwse-resize',
        position: 'bottom-right'
      },
      topCenter: {
        x: midX,
        y: minY,
        cursor: 'ns-resize',
        position: 'top-center'
      },
      bottomCenter: {
        x: midX,
        y: maxY,
        cursor: 'ns-resize',
        position: 'bottom-center'
      },
      centerLeft: {
        x: minX,
        y: midY,
        cursor: 'ew-resize',
        position: 'left-center'
      },
      centerRight: {
        x: maxX,
        y: midY,
        cursor: 'ew-resize',
        position: 'right-center'
      }
    }

    this.handles = Object.values(handlerPoints)
    // 注意：这里的顺序必须和 resize 中判断的顺序逻辑一致，或者 resize 中通过坐标距离判断
    return this.handles
  }

  resizeStart(handle: HandleItemType) {
    this.handle = handle
    switch (handle.position) {
      case 'bottom-center':
        {
          let find = this.handles!.find((f) => f.position === 'top-left')
          this.startPoint = {
            x: find!.x,
            y: find!.y
          }
          find = this.handles!.find((f) => f.position === 'bottom-right')
          this.endPoint = {
            x: find!.x,
            y: find!.y
          }
        }
        break
      case 'bottom-left':
        {
          const find = this.handles!.find((f) => f.position === 'top-right')
          this.startPoint = {
            x: find!.x,
            y: find!.y
          }
          this.endPoint = {
            x: handle.x,
            y: handle.y
          }
        }
        break
      case 'right-center':
        {
          let find = this.handles!.find((f) => f.position === 'top-left')
          this.startPoint = {
            x: find!.x,
            y: find!.y
          }
          find = this.handles!.find((f) => f.position === 'bottom-right')
          this.endPoint = {
            x: find!.x,
            y: find!.y
          }
        }
        break
      case 'left-center':
        {
          let find = this.handles!.find((f) => f.position === 'top-right')
          this.startPoint = {
            x: find!.x,
            y: find!.y
          }
          find = this.handles!.find((f) => f.position === 'bottom-left')
          this.endPoint = {
            x: find!.x,
            y: find!.y
          }
        }
        break
      case 'bottom-right':
        {
          const find = this.handles!.find((f) => f.position === 'top-left')
          this.startPoint = {
            x: find!.x,
            y: find!.y
          }
          this.endPoint = {
            x: handle.x,
            y: handle.y
          }
        }
        break
      case 'top-center':
        {
          let find = this.handles!.find((f) => f.position === 'bottom-left')
          this.startPoint = {
            x: find!.x,
            y: find!.y
          }
          find = this.handles!.find((f) => f.position === 'top-right')
          this.endPoint = {
            x: find!.x,
            y: find!.y
          }
        }
        break
      case 'top-left':
        {
          const find = this.handles!.find((f) => f.position === 'bottom-right')
          this.startPoint = {
            x: find!.x,
            y: find!.y
          }
          this.endPoint = {
            x: handle.x,
            y: handle.y
          }
        }
        break
      case 'top-right':
        {
          const find = this.handles!.find((f) => f.position === 'bottom-left')
          this.startPoint = {
            x: find!.x,
            y: find!.y
          }
          this.endPoint = {
            x: handle.x,
            y: handle.y
          }
        }
        break
    }
  }

  resize({ x, y }: Point) {
    switch (this.handle?.position) {
      case 'bottom-center':
        this.endPoint.y = y
        break
      case 'bottom-left':
        this.update({
          x,
          y
        })
        break
      case 'right-center':
        this.endPoint.x = x
        break
      case 'left-center':
        this.endPoint.x = x
        break
      case 'bottom-right':
        this.update({
          x,
          y
        })
        break
      case 'top-center':
        this.endPoint.y = y
        break
      case 'top-left':
        this.update({
          x,
          y
        })
        break
      case 'top-right':
        this.update({
          x,
          y
        })
        break
    }
  }

  private getStrokeWidth() {
    const store = CapturerStore()
    const widths: any = {
      5: 2,
      10: 5,
      20: 9
    }
    return widths[this.toolWidth] * store.scaleFactor
  }

  /**
   * 绘制椭圆
   * @param isSelected 是否被选中
   */
  draw() {
    const x = Math.min(this.startPoint.x, this.endPoint.x)
    const y = Math.min(this.startPoint.y, this.endPoint.y)
    const width = Math.abs(this.startPoint.x - this.endPoint.x)
    const height = Math.abs(this.startPoint.y - this.endPoint.y)
    const radiusX = width * 0.5
    const radiusY = height * 0.5
    const centerX = x + radiusX
    const centerY = y + radiusY

    const ctx = ScreenStore.rectCtx!
    // 【关键点 1】禁用平滑处理，产生像素颗粒感
    ctx.imageSmoothingEnabled = false
    ctx.strokeStyle = this.strokeColor
    ctx.lineWidth = this.getStrokeWidth()

    ctx.beginPath()
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2)
    ctx.stroke()

    if (this.showHandle) {
      const store = CapturerStore()
      // ctx.imageSmoothingEnabled = true
      // 绘制控制点

      ctx.fillStyle = '#FFFFFF'
      ctx.strokeStyle = '#333333'
      ctx.lineWidth = 1 * store.scaleFactor

      ctx.beginPath()
      ctx.rect(x, y, width, height)
      ctx.stroke()

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
