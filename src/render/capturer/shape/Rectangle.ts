import { Shape } from './Shape'
import type { Point } from './Shape'
import { CapturerStore, ScreenStore } from '@/capturer/store/app'

export class Rectangle extends Shape {
  /**
   * 判断点是否在边框线上
   */
  isOnBorder(x: number, y: number) {
    const store = CapturerStore()
    const borderThreshold = (this.getStrokeWidth() + 2 * store.scaleFactor) * 0.5
    const inLeftBorder =
      Math.abs(x - this.startPoint.x) <= borderThreshold &&
      y >= Math.min(this.startPoint.y, this.endPoint.y) - borderThreshold &&
      y <= Math.max(this.startPoint.y, this.endPoint.y) + borderThreshold

    const inRightBorder =
      Math.abs(x - this.endPoint.x) <= borderThreshold &&
      y >= Math.min(this.startPoint.y, this.endPoint.y) - borderThreshold &&
      y <= Math.max(this.startPoint.y, this.endPoint.y) + borderThreshold

    const inTopBorder =
      Math.abs(y - this.startPoint.y) <= borderThreshold &&
      x >= Math.min(this.startPoint.x, this.endPoint.x) - borderThreshold &&
      x <= Math.max(this.startPoint.x, this.endPoint.x) + borderThreshold

    const inBottomBorder =
      Math.abs(y - this.endPoint.y) <= borderThreshold &&
      x >= Math.min(this.startPoint.x, this.endPoint.x) - borderThreshold &&
      x <= Math.max(this.startPoint.x, this.endPoint.x) + borderThreshold

    return (
      inLeftBorder || // 左边框
      inRightBorder || // 右边框
      inTopBorder || // 上边框
      inBottomBorder // 下边框
    )
  }

  /**
   * 返回控制点
   */
  getHandles() {
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

    const handlerPoints = {
      topLeft: {
        x: minX,
        y: minY,
        cursor: 'nwse-resize'
      },
      topRight: {
        x: maxX,
        y: minY,
        cursor: 'nesw-resize'
      },
      bottomLeft: {
        x: minX,
        y: maxY,
        cursor: 'nesw-resize'
      },
      bottomRight: {
        x: maxX,
        y: maxY,
        cursor: 'nwse-resize'
      },
      topCenter: {
        x: midX,
        y: minY,
        cursor: 'ns-resize'
      },
      bottomCenter: {
        x: midX,
        y: maxY,
        cursor: 'ns-resize'
      },
      centerLeft: {
        x: minX,
        y: midY,
        cursor: 'ew-resize'
      },
      centerRight: {
        x: maxX,
        y: midY,
        cursor: 'ew-resize'
      }
    }

    this.handles = Object.values(handlerPoints)
    // 注意：这里的顺序必须和 resize 中判断的顺序逻辑一致，或者 resize 中通过坐标距离判断
    return this.handles
  }

  /**
   * 根据handle数据 重新计算位置大小 写入Shape的startPoint和endPoint
   *
   * @param handleEndPoint 鼠标当前的坐标
   */
  resize(handleEndPoint: Point) {
    // 1. 更新 handle 中的当前鼠标点，保持状态同步
    this.handle!.handleEndPoint = handleEndPoint

    const { startPoint: s, endPoint: e, handleStartPoint: hs } = this.handle!

    // 2. 计算鼠标移动的增量 delta
    const dx = handleEndPoint.x - hs.x
    const dy = handleEndPoint.y - hs.y

    // 3. 判断当前拖拽的是哪一个手柄（Handle）
    // 我们对比 handleStartPoint (点击时的鼠标位置) 和 原始图形的关键点位置
    const threshold = 5 // 点击容差范围

    const isNear = (targetX: number, targetY: number) => {
      return Math.abs(hs.x - targetX) <= threshold && Math.abs(hs.y - targetY) <= threshold
    }

    // 辅助：计算原始图形的中间值
    const width = Math.abs(s.x - e.x)
    const height = Math.abs(s.y - e.y)
    const minX = Math.min(s.x, e.x)
    const minY = Math.min(s.y, e.y)
    const midX = minX + width / 2
    const midY = minY + height / 2

    // --- 四个角调整 ---

    // 1. 拖拽 startPoint (通常是左上)
    if (isNear(s.x, s.y)) {
      this.startPoint.x = s.x + dx
      this.startPoint.y = s.y + dy
    }
    // 2. 拖拽 endPoint (通常是右下)
    else if (isNear(e.x, e.y)) {
      this.endPoint.x = e.x + dx
      this.endPoint.y = e.y + dy
    }
    // 3. 拖拽右上/左下 (混合角) -> {x: e.x, y: s.y}
    else if (isNear(e.x, s.y)) {
      this.endPoint.x = e.x + dx // 改宽度
      this.startPoint.y = s.y + dy // 改高度
    }
    // 4. 拖拽左下/右上 (混合角) -> {x: s.x, y: e.y}
    else if (isNear(s.x, e.y)) {
      this.startPoint.x = s.x + dx // 改宽度
      this.endPoint.y = e.y + dy // 改高度
    }

    // --- 四条边调整 ---

    // 5. 拖拽 startY 所在的横边中心
    else if (isNear(midX, s.y)) {
      this.startPoint.y = s.y + dy
    }
    // 6. 拖拽 endY 所在的横边中心
    else if (isNear(midX, e.y)) {
      this.endPoint.y = e.y + dy
    }
    // 7. 拖拽 startX 所在的竖边中心
    else if (isNear(s.x, midY)) {
      this.startPoint.x = s.x + dx
    }
    // 8. 拖拽 endX 所在的竖边中心
    else if (isNear(e.x, midY)) {
      this.endPoint.x = e.x + dx
    }
  }

  private getStrokeWidth() {
    const store = CapturerStore()
    const widths = {
      5: 2,
      10: 5,
      20: 9
    }
    return widths[this.toolWidth] * store.scaleFactor
  }

  /**
   * 绘制矩形 需要有4px的圆角
   * @param isSelected 是否被选中
   */
  draw() {
    // 2. 计算标准化的矩形参数 (x, y, w, h)，确保宽高为正数
    const x = Math.min(this.startPoint.x, this.endPoint.x)
    const y = Math.min(this.startPoint.y, this.endPoint.y)
    const width = Math.abs(this.startPoint.x - this.endPoint.x)
    const height = Math.abs(this.startPoint.y - this.endPoint.y)
    const radius = 4

    const ctx = ScreenStore.rectCtx
    // 【关键点 1】禁用平滑处理，产生像素颗粒感
    ctx.imageSmoothingEnabled = false
    ctx.strokeStyle = this.strokeColor
    ctx.lineWidth = this.getStrokeWidth()
    // 3. 绘制圆角矩形路径
    ctx.beginPath()
    // 防止宽度小于 2 * radius 导致绘制异常
    const r = Math.min(radius, width / 2, height / 2)

    ctx.moveTo(x + r, y)
    ctx.lineTo(x + width - r, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + r)
    ctx.lineTo(x + width, y + height - r)
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
    ctx.lineTo(x + r, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)

    ctx.closePath()

    // 4. 描边
    ctx.stroke()

    super.draw()
  }
}
