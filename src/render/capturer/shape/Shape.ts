import { CapturerStore } from '@/capturer/store/app'
import CapurerTool from '@/capturer/tools/tools'
import RectSelect from '@/capturer/RectSelector/RectSelect'
import RectCanvasStore from '@/capturer/RectCanvas/RectCanvas'
import { uuid } from '@/util/Index'

export type ShapeItemTypeType = 'square' | 'circle' | 'arrow' | 'draw' | 'mask' | 'text' | 'tag'
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
    | 'tag-text-position'
}

export class Shape {
  id: string = ''
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
  handle?: HandleItemType | null = undefined
  handles?: HandleItemType[] | null = undefined
  width: number = 0
  height: number = 0
  pathCache?: Path2D | null = undefined // 缓存路径对象
  canvas?: HTMLCanvasElement | null = undefined
  canvasCtx?: CanvasRenderingContext2D | null = undefined
  zIndex = 0
  historyAdded: boolean = false

  destroy() {
    this.handle = null
    this.handles = null
    this.pathCache = null
    this.canvasCtx = null
    this.canvas?.remove()
    this.canvas = null
  }

  historyRedo(record: Shape) {
    this.startPoint = record.startPoint
    this.endPoint = record.endPoint
    this.strokeColor = record.strokeColor
    this.toolWidth = record.toolWidth
    this.showHandle = false
    this.width = record.width
    this.height = record.height
    this.zIndex = record.zIndex
  }

  checkMouseOnHandle(x: number, y: number) {
    const store = CapturerStore()
    const handleSize = 7 * store.scaleFactor
    const handles = this?.handles ?? []
    for (const handle of handles) {
      if (Math.abs(x - handle.x) <= handleSize && Math.abs(y - handle.y) <= handleSize) {
        return {
          handle,
          shape: this,
          onBorder: false,
          onShape: false
        }
      }
    }
    return undefined
  }

  initCanvas() {
    const store = CapturerStore()
    const canvas = document.createElement('canvas')
    canvas.width = RectSelect.editRect!.width * store.scaleFactor
    canvas.height = RectSelect.editRect!.height * store.scaleFactor
    canvas.style.width = RectSelect.editRect!.width + 'px'
    canvas.style.height = RectSelect.editRect!.height + 'px'
    canvas.className = 'capturer-shape-canvas'

    const zIndexs = RectCanvasStore.shape.filter((f) => f.type !== 'mask').map((m) => m.zIndex)
    const maxZIndex = Math.max(...zIndexs, 1999)
    console.log('Shape initCanvas maxZIndex: ', maxZIndex, zIndexs)
    const zIndex = maxZIndex + 1
    this.zIndex = zIndex
    canvas.style.zIndex = `${zIndex}`
    const selector: HTMLHtmlElement = document.querySelector('#app-capturer-selector')!
    selector.appendChild(canvas)
    this.canvas = canvas
    this.canvasCtx = this.canvas.getContext('2d')
  }

  onToolWidthChanged() {}

  onStrokeColorChanged() {}

  constructor(type: ShapeItemTypeType, startPoint: Point, strokeColor: string, toolWidth: number) {
    this.id = uuid()
    this.type = type
    this.startPoint = startPoint
    this.strokeColor = strokeColor
    this.toolWidth = toolWidth
    this.initCanvas()

    console.log('Shape init: ', JSON.parse(JSON.stringify(this)), this.zIndex)
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
    const zIndexs = RectCanvasStore.shape.filter((f) => f.type !== 'mask').map((m) => m.zIndex)
    const maxZIndex = Math.max(...zIndexs, 1999)
    const zIndex = maxZIndex + 1
    this.zIndex = zIndex
    this.canvas!.style.zIndex = `${zIndex}`
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
      CapurerTool.draw.width = this.toolWidth
      CapurerTool.draw.color = this.strokeColor
    } else if (this.type === 'text') {
      CapurerTool.tool = 'text'
      CapurerTool.text.fontSize = this.toolWidth
      CapurerTool.text.color = this.strokeColor
    } else if (this.type === 'tag') {
      CapurerTool.tool = 'tag'
      CapurerTool.tag.fontSize = this.toolWidth
      CapurerTool.tag.color = this.strokeColor
    }
  }

  reDraw() {}

  draw() {}

  async exportCanvas(): Promise<HTMLCanvasElement> {
    return this.canvas!
  }
}
