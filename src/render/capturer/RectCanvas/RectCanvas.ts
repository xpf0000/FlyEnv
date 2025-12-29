import { Shape } from '@/capturer/shape/Shape'
import type { HandleItemType, Point } from '@/capturer/shape/Shape'
import { Rectangle } from '@/capturer/shape/Rectangle'
import { ScreenStore, CapturerStore } from '@/capturer/store/app'
import CapurerTool from '@/capturer/tools/tools'
import { reactiveBind } from '@/util/Index'
import RectSelect from '@/capturer/RectSelector/RectSelect'
import { Ellipse } from '@/capturer/shape/Ellipse'
import { Arrow } from '@/capturer/shape/Arrow'

type RectCanvasHoverItemType = {
  handle?: HandleItemType
  shape?: Shape
  onBorder: boolean
  onShape: boolean
}

class RectCanvas {
  shape: Shape[] = []
  history: {
    list: Shape[]
  } = {
    list: []
  }
  actionType: 'add' | 'move' | 'resize' | '' = 'add'
  edit?: Shape
  hover?: RectCanvasHoverItemType = undefined
  move?: {
    handle?: HandleItemType
    shapeBegin?: Shape
    pointBegin: Point
  }

  reinit() {
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mouseup', this.onMouseUp)
    this.shape.splice(0)
    this.history?.list?.splice(0)
    this.actionType = ''
    this.edit = undefined
  }

  hideAllHandle() {
    this.edit = undefined
    this.move = undefined
    let needDraw = false
    this.shape.forEach((shape) => {
      if (shape.showHandle) {
        needDraw = true
        shape.showHandle = false
      }
    })
    if (needDraw) {
      this.draw()
    }
  }

  /**
   * 鼠标按下开始选区
   */
  onMouseDown(e: MouseEvent) {
    console.log('RectCanvas onMouseDown !!! 000')
    if (!RectSelect.editRect || !ScreenStore.rectCanvas) {
      return
    }
    e.preventDefault()
    this.hideAllHandle()
    this.actionType = ''
    const store = CapturerStore()
    console.log('RectCanvas onMouseDown !!! 111', this.hover, CapurerTool.tool)
    if (this.hover?.handle) {
      this.edit = this.hover.shape
      this.edit!.select()
      this.draw()
      this.actionType = 'resize'
      this.move = {
        handle: this.hover.handle,
        shapeBegin: JSON.parse(JSON.stringify(this.edit)),
        pointBegin: {
          x: e.offsetX * store.scaleFactor,
          y: e.offsetY * store.scaleFactor
        }
      }
      this.edit!.resizeStart(this.hover.handle)
    } else if (this.hover?.shape) {
      this.edit = this.hover.shape
      this.edit!.select()
      this.draw()
      this.actionType = 'move'
      this.move = {
        shapeBegin: JSON.parse(JSON.stringify(this.edit)),
        pointBegin: {
          x: e.offsetX * store.scaleFactor,
          y: e.offsetY * store.scaleFactor
        }
      }
    } else if (CapurerTool.tool) {
      this.actionType = 'add'
      this.move = {
        shapeBegin: undefined,
        pointBegin: {
          x: e.offsetX * store.scaleFactor,
          y: e.offsetY * store.scaleFactor
        }
      }
    }

    if (this.actionType) {
      window.addEventListener('mousemove', this.onMouseMove)
      window.addEventListener('mouseup', this.onMouseUp)
    }
  }

  /**
   * 鼠标移动更新选区
   */
  private onMouseMove(e: MouseEvent) {
    if (!RectSelect.editRect || !CapurerTool.tool || !ScreenStore.rectCanvas) {
      return
    }
    e.preventDefault()
    const store = CapturerStore()
    const x = (e.clientX - RectSelect.editRect.x) * store.scaleFactor
    const y = (e.clientY - RectSelect.editRect.y) * store.scaleFactor
    if (this.actionType === 'add') {
      if (!this.edit) {
        if (CapurerTool.tool === 'square') {
          const config = CapurerTool.square
          const shape: Shape = new Rectangle(
            'square',
            this.move!.pointBegin,
            config.color,
            config.width
          ) as any
          shape.showHandle = true
          this.edit = shape
          this.shape.push(shape)
        } else if (CapurerTool.tool === 'circle') {
          const config = CapurerTool.circle
          const shape: Shape = new Ellipse(
            'circle',
            this.move!.pointBegin,
            config.color,
            config.width
          ) as any
          shape.showHandle = true
          this.edit = shape
          this.shape.push(shape)
        } else if (CapurerTool.tool === 'arrow') {
          const config = CapurerTool.arrow
          console.log('arrow config: ', JSON.stringify(config))
          const shape: Shape = new Arrow(
            'arrow',
            this.move!.pointBegin,
            config.color,
            config.width
          ) as any
          shape.showHandle = true
          this.edit = shape
          this.shape.push(shape)
        }
      }
      this.edit!.update({
        x,
        y
      })
    } else if (this.actionType === 'move') {
      const diffX = x - this.move!.pointBegin.x
      const diffY = y - this.move!.pointBegin.y
      this.edit!.startPoint.x = this.move!.shapeBegin!.startPoint.x + diffX
      this.edit!.startPoint.y = this.move!.shapeBegin!.startPoint.y + diffY
      this.edit!.endPoint.x = this.move!.shapeBegin!.endPoint.x + diffX
      this.edit!.endPoint.y = this.move!.shapeBegin!.endPoint.y + diffY
    } else if (this.actionType === 'resize') {
      this.edit!.resize({ x, y })
    }

    this.draw()
  }

  /**
   * 鼠标释放结束选区
   */
  private onMouseUp(e: MouseEvent) {
    if (!RectSelect.editRect || !CapurerTool.tool || !ScreenStore.rectCanvas) {
      return
    }
    e.preventDefault()

    let needDraw = false
    if (!this.edit) {
      this.shape.forEach((shape) => {
        if (shape.showHandle) {
          needDraw = true
          shape.showHandle = false
        }
      })
    }
    if (needDraw) {
      this.draw()
    }

    this.move = undefined
    this.actionType = ''
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mouseup', this.onMouseUp)
  }

  draw() {
    const ctx = ScreenStore.rectCtx
    ctx?.clearRect(0, 0, ScreenStore.rectCanvas!.width, ScreenStore.rectCanvas!.height)
    for (const item of this.shape) {
      item.draw()
    }
  }

  private getHoveredHandle(x: number, y: number) {
    const shapes = [...this.shape].reverse()
    const store = CapturerStore()
    const handleSize = 7 * store.scaleFactor
    let onBorder = false
    for (const shape of shapes) {
      if (!onBorder) {
        onBorder = shape.isOnBorder(x, y)
      }
      const handles = shape?.handles ?? []
      for (const handle of handles) {
        if (Math.abs(x - handle.x) <= handleSize && Math.abs(y - handle.y) <= handleSize) {
          return {
            handle,
            shape,
            onBorder: false,
            onShape: false
          }
        }
      }
      if (onBorder) {
        return {
          handle: undefined,
          shape,
          onBorder,
          onShape: false
        }
      }
      const onShape = shape.isOnShape(x, y)
      if (onShape) {
        return {
          handle: undefined,
          shape,
          onBorder: false,
          onShape
        }
      }
    }
    return undefined
  }

  private updateCursor() {
    if (!this.hover) {
      ScreenStore.rectCanvas!.style.cursor = 'auto'
      return
    }
    if (this.hover.handle) {
      ScreenStore.rectCanvas!.style.cursor = this.hover.handle.cursor
      return
    }
    if (this.hover.onBorder) {
      ScreenStore.rectCanvas!.style.cursor = 'move'
      return
    }
    if (this.hover.onShape) {
      ScreenStore.rectCanvas!.style.cursor = 'move'
      return
    }
  }

  public onCanvasMouseMove(e: MouseEvent) {
    if (this.actionType) {
      return
    }
    const prevHoveredHandle = this.hover?.handle
    const prevHoveredBorder = this.hover?.onBorder
    const prevHoveredShape = this.hover?.onShape

    const store = CapturerStore()
    const handle = this.getHoveredHandle(
      e.offsetX * store.scaleFactor,
      e.offsetY * store.scaleFactor
    )
    console.log('handle: ', handle)
    if (!handle) {
      this.hover = undefined
      this.updateCursor()
    } else if (
      handle &&
      (handle.handle !== prevHoveredHandle ||
        handle.onBorder !== prevHoveredBorder ||
        handle.onShape !== prevHoveredShape)
    ) {
      this.hover = handle
      this.updateCursor()
    }
  }
}

export default reactiveBind(new RectCanvas())
