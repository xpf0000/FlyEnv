import type { Shape } from '@/capturer/shape/Shape'
import type { HandleItemType, Point } from '@/capturer/shape/Shape'
import { Rectangle } from '@/capturer/shape/Rectangle'
import { ScreenStore, CapturerStore } from '@/capturer/store/app'
import CapurerTool from '@/capturer/tools/tools'
import { reactiveBind } from '@/util/Index'
import RectSelect from '@/capturer/RectSelector/RectSelect'
import { Ellipse } from '@/capturer/shape/Ellipse'
import { Arrow } from '@/capturer/shape/Arrow'
import { Draw } from '@/capturer/shape/Draw'
import { Mask } from '@/capturer/shape/Mask'
import { Text } from '@/capturer/shape/Text'
import { Tag } from '@/capturer/shape/Tag'

type RectCanvasHoverItemType = {
  handle?: HandleItemType
  shape?: Shape
  onBorder: boolean
  onShape: boolean
}

type HisoryItemType = {
  action: 'add' | 'change'
  start?: Shape
  end: Shape
}

class RectCanvas {
  shape: Shape[] = []
  history: HisoryItemType[] = []
  actionType: 'add' | 'move' | 'resize' | '' = 'add'
  editBegin?: Shape | null
  edit?: Shape | null
  editingText?: Text | Tag | null
  hover?: RectCanvasHoverItemType | null = undefined
  move?: {
    handle?: HandleItemType
    shapeBegin?: Shape
    pointBegin: Point
  } | null

  _onMouseDownCallback?: (e: MouseEvent) => void

  reinit() {
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mouseup', this.onMouseUp)
    this.shape.forEach((shape: Shape) => {
      shape.destroy()
    })
    this.shape.splice(0)
    this.history?.splice(0)
    this.actionType = ''
    this.edit = null
    this.editBegin = null
    this.move = null
    this.hover = null
    this.editingText = null
  }

  onToolTypeChange() {
    this.hideAllHandle()
    this.actionType = ''
    this.editingText = null
    this.edit = null
    this.editBegin = null
    this.hover = null
    this.move = null
  }

  hideAllHandle(exclude?: Shape) {
    this.edit = null
    this.editBegin = null
    this.move = null
    this.shape.forEach((shape) => {
      if (shape.showHandle && shape !== exclude) {
        shape.deSelect()
        shape.draw()
      }
    })
  }

  editStringify(edit: Shape) {
    const editBegin: any = JSON.parse(JSON.stringify(edit))
    delete editBegin?.showHandle
    delete editBegin?.arrowPoints
    delete editBegin?.drawPoints
    delete editBegin?.textEditing
    delete editBegin?.pathCache
    delete editBegin?.handle
    delete editBegin?.handles
    return editBegin
  }

  private initEditBegin() {
    if (!this.edit) {
      return
    }
    this.editBegin = this.editStringify(this.edit)
  }

  private checkEditChanged() {
    if (!this.edit || !this.editBegin || this.edit.id !== this.editBegin.id) {
      return false
    }
    const editBegin: any = this.editStringify(this.edit)
    if (JSON.stringify(editBegin) === JSON.stringify(this.editBegin)) {
      return false
    }
    return editBegin
  }

  onDblClick(e: MouseEvent) {
    if (!RectSelect.editRect || !ScreenStore.rectCanvas) {
      return
    }
    if (this?.hover?.shape?.type === 'text') {
      e?.preventDefault?.()
      e?.stopPropagation?.()
      const shape: Text = this.hover.shape as Text
      shape.editContent()
      shape.draw()
      this.edit = shape as any
      this.initEditBegin()
      this.editingText = shape as any
    } else if (this?.hover?.shape?.type === 'tag') {
      e?.preventDefault?.()
      e?.stopPropagation?.()
      const shape: Tag = this.hover.shape as Tag
      shape.editContent()
      shape.draw()
      this.edit = shape as any
      this.initEditBegin()
      this.editingText = shape as any
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
    const noAddedShape = this.shape.filter((s) => !s.historyAdded)
    noAddedShape.forEach((shape: Shape) => {
      shape.historyAdded = true
      this.history.push({
        action: 'add',
        start: undefined,
        end: JSON.parse(JSON.stringify(shape))
      })
      console.log('this.history: ', JSON.parse(JSON.stringify(this.history)))
    })
    if (this.hover?.handle?.position === 'tag-text-position') {
      const tag: Tag = this.hover.shape! as any
      this.hideAllHandle(tag as any)
      this.edit = tag as any
      const start = this.editStringify(tag as any)
      tag.textPositionChanged()
      this.history.push({
        action: 'change',
        start,
        end: this.editStringify(tag as any)
      })
      console.log('this.history: ', JSON.parse(JSON.stringify(this.history)))
      return
    }
    this.hideAllHandle()
    this.actionType = ''
    const store = CapturerStore()
    console.log('RectCanvas onMouseDown !!! 111', this.hover, CapurerTool.tool)
    if (this.hover?.handle) {
      if (this.editingText) {
        this.editingText = null
      }
      this.edit = this.hover.shape
      this.initEditBegin()
      this.edit!.select()
      this.edit!.draw()
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
      if (this.editingText) {
        this.editingText = null
      }
      this.edit = this.hover.shape
      this.initEditBegin()
      this.edit!.select()
      this.edit!.draw()
      this.actionType = 'move'
      this.move = {
        shapeBegin: JSON.parse(JSON.stringify(this.edit)),
        pointBegin: {
          x: e.offsetX * store.scaleFactor,
          y: e.offsetY * store.scaleFactor
        }
      }
    } else if (CapurerTool.tool) {
      if (this.editingText) {
        this.editingText = null
        return
      }
      this.actionType = 'add'
      this.move = {
        shapeBegin: undefined,
        pointBegin: {
          x: e.offsetX * store.scaleFactor,
          y: e.offsetY * store.scaleFactor
        }
      }
      if (CapurerTool.tool === 'mask') {
        ScreenStore.createMosaicPattern(20)
      } else if (CapurerTool.tool === 'text') {
        const config = CapurerTool.text
        console.log('arrow config: ', JSON.stringify(config))
        const shape: Text = new Text(
          'text',
          this.move!.pointBegin,
          config.color,
          config.fontSize
        ) as any
        shape.showHandle = true
        this.edit = shape as Shape
        this.editingText = shape
        this.shape.push(shape as Shape)
        this.move = null
        this.actionType = ''
        return
      } else if (CapurerTool.tool === 'tag') {
        const config = CapurerTool.tag
        console.log('arrow config: ', JSON.stringify(config))
        const shape: Tag = new Tag(
          'tag',
          this.move!.pointBegin,
          config.color,
          config.fontSize
        ) as any
        shape.showHandle = true
        this.edit = shape as Shape
        this.edit.draw()
        this.editingText = shape
        this.shape.push(shape as Shape)
        this.move = null
        this.actionType = ''
        return
      }
    } else if (this.shape.length === 0) {
      this?._onMouseDownCallback?.(e)
      return
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
    if (!RectSelect.editRect || !ScreenStore.rectCanvas) {
      return
    }
    e?.preventDefault?.()
    e?.stopPropagation?.()
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
        } else if (CapurerTool.tool === 'draw') {
          const config = CapurerTool.draw
          console.log('arrow config: ', JSON.stringify(config))
          const shape: Shape = new Draw(
            'draw',
            this.move!.pointBegin,
            config.color,
            config.width
          ) as any
          shape.showHandle = true
          this.edit = shape
          this.shape.push(shape)
        } else if (CapurerTool.tool === 'mask') {
          const config = CapurerTool.mask
          console.log('arrow config: ', JSON.stringify(config))
          const shape: Mask = new Mask(
            'mask',
            this.move!.pointBegin,
            config.color,
            config.width
          ) as any
          shape.maskType = config.type
          shape.showHandle = true
          this.edit = shape as Shape
          this.shape.unshift(shape as Shape)
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
      this.edit!.onMove()
    } else if (this.actionType === 'resize') {
      this.edit!.resize({ x, y })
    }

    this.edit!.draw()
  }

  /**
   * 鼠标释放结束选区
   */
  private onMouseUp(e: MouseEvent) {
    if (!RectSelect.editRect || !ScreenStore.rectCanvas) {
      return
    }
    e?.preventDefault?.()
    e?.stopPropagation?.()

    let historyItem: Shape | null | undefined = undefined
    if (this.edit && this.edit.historyAdded) {
      historyItem = this.edit
    }
    const noAddedShape = this.shape.filter((s) => !s.historyAdded)
    noAddedShape.forEach((shape: Shape) => {
      shape.historyAdded = true
      this.history.push({
        action: 'add',
        start: undefined,
        end: this.editStringify(shape)
      })
      console.log('this.history: ', JSON.parse(JSON.stringify(this.history)))
    })
    if (historyItem) {
      const editEnd = this.checkEditChanged()
      console.log('historyItem: ', historyItem, editEnd)
      if (editEnd) {
        this.history.push({
          action: 'change',
          start: this.editBegin!,
          end: editEnd
        })
        console.log('this.history: ', JSON.parse(JSON.stringify(this.history)))
      }
    }

    if (this.actionType === 'add') {
      this.shape.forEach((shape) => {
        if (shape.showHandle) {
          shape.deSelect()
          shape.draw()
        }
      })
      this.edit = null
    }
    this.editBegin = null
    this.move = null
    this.actionType = ''
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mouseup', this.onMouseUp)
  }

  historyDoBack() {
    /**
     * 移除未确定的Shape. 比如正在编辑的text和tag
     */
    const noAddedShape = this.shape.filter((s) => !s.historyAdded)
    if (noAddedShape.length > 0) {
      noAddedShape.forEach((shape: Shape) => {
        shape.destroy()
      })
      this.shape = this.shape.filter((s) => s.historyAdded)
      if (this.editingText) {
        this.editingText = null
      }
      return
    }
    const record = this.history.pop()
    if (record?.action === 'add') {
      const find = this.shape.find((s) => s.id === record.end!.id)
      if (find) {
        find.destroy()
      }
      this.shape = this.shape.filter((s) => s.id !== record.end!.id)
    } else if (record?.action === 'change') {
      const find = this.shape.find((s) => s.id === record.end!.id)
      if (find) {
        find.historyRedo(record.start!)
      }
    }
  }

  private getHoveredHandle(x: number, y: number) {
    const shapes = [...this.shape].reverse()
    let onBorder = false
    for (const shape of shapes) {
      if (!onBorder) {
        onBorder = shape.isOnBorder(x, y)
      }
      const res = shape.checkMouseOnHandle(x, y)
      if (res) {
        return res
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
      if (this.shape.length === 0 && !CapurerTool.tool && !RectSelect.editRectId) {
        ScreenStore.rectCanvas!.style.cursor = 'move'
      } else {
        ScreenStore.rectCanvas!.style.cursor = 'auto'
      }
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
