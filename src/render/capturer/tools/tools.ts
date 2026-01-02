import { reactiveBind } from '@/util/Index'
import type { Rect } from '@/capturer/store/app'
import RectCanvasStore from '@/capturer/RectCanvas/RectCanvas'

type ColorAndWidthItemType = {
  color: string
  width: number
}

type TextItemType = {
  color: string
  fontSize: number
}

type MaskItemType = {
  color: string
  width: number
  type: 'area' | 'hand'
}

type CapurerToolToolType = 'square' | 'circle' | 'arrow' | 'draw' | 'mask' | 'text' | 'tag' | ''

type CapurerToolType = {
  tool: CapurerToolToolType
  square: ColorAndWidthItemType
  circle: ColorAndWidthItemType
  arrow: ColorAndWidthItemType
  draw: ColorAndWidthItemType
  mask: MaskItemType
  text: TextItemType
}

export const CapurerToolWidth = 358
export const CapurerToolHeight = 82
export const CapurerToolHeightOne = 36

class CapurerTool implements CapurerToolType {
  arrow = {
    color: '#F56C6C',
    width: 10
  }
  circle = {
    color: '#F56C6C',
    width: 10
  }
  draw = {
    color: '#F56C6C',
    width: 10
  }
  mask: MaskItemType = {
    color: '#F56C6C',
    width: 10,
    type: 'area'
  }
  square = {
    color: '#F56C6C',
    width: 10
  }
  text = {
    color: '#F56C6C',
    fontSize: 15
  }
  tag = {
    color: '#F56C6C',
    fontSize: 15
  }
  tool: CapurerToolToolType = ''
  private initData: any
  isReversed: boolean = false
  style?: any = undefined

  constructor() {
    this.initData = JSON.parse(JSON.stringify(this))
  }
  reinit() {
    const obj = JSON.parse(JSON.stringify(this.initData))
    Object.assign(this, this.initData)
    this.initData = obj
    this.style = undefined
  }
  updateTool(tool: CapurerToolToolType) {
    if (this.tool === tool) {
      this.tool = ''
    } else {
      this.tool = tool
    }
    RectCanvasStore.onToolTypeChange()
  }
  updatePosition(rect?: Rect) {
    if (!rect) {
      this.style = undefined
      return
    }
    const windowWidth = window.innerWidth
    const windowHeight = window.innerHeight
    const offset = 8
    let right = windowWidth - rect.x - rect.width
    let top = rect.y + rect.height + offset

    if (top + CapurerToolHeight > windowHeight) {
      top = rect.y - CapurerToolHeight - offset
      if (top < 0) {
        top = rect.y + rect.height - offset - CapurerToolHeightOne
        right = right + offset
      } else {
        top = rect.y - CapurerToolHeightOne - offset
      }
    }

    if (CapurerToolWidth + right >= windowWidth) {
      right = windowWidth - CapurerToolWidth - offset
    }

    if (rect.x + rect.width - offset < CapurerToolWidth) {
      right = windowWidth - rect.x - CapurerToolWidth - offset
    }

    this.style = {
      right: `${right}px`,
      top: `${top}px`
    }

    const isBelow = top > rect.y + rect.height
    this.isReversed = !isBelow
    console.log('this.isReversed:', this.isReversed)
  }
}

export default reactiveBind(new CapurerTool())
