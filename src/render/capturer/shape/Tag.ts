import { HandleItemType, Shape, ShapeItemTypeType } from './Shape'
import type { Point } from './Shape'
import { CapturerStore } from '@/capturer/store/app'
import { toCanvasAndSVG } from '@/util/html-to-image'

export class Tag extends Shape {
  // 离屏画布相关属性
  private offScreenCanvas: HTMLCanvasElement | null = null
  private textArea: HTMLTextAreaElement | null = null
  // 新增：影子节点，用于计算宽高
  private mirror: HTMLElement | null = null
  private selector: HTMLElement | null = null
  textPosition: 'right' | 'left' = 'right'
  textEditing = true
  text: string = ''

  private flagPointRadius = 4
  private padding = 12
  private flagPointToTop = 9
  private flagPointToTextBox = 5
  private textBoxFlagWidth = 8
  private textBoxFlagRadius = 6

  historyRedo(tag: Tag) {
    super.historyRedo(tag)
    this.textPosition = tag.textPosition
    this.text = tag.text

    const store = CapturerStore()
    let top = 0
    let left = 0
    if (this.textPosition === 'right') {
      top = this.startPoint.y + this.padding
      left =
        this.startPoint.x +
        this.padding +
        this.flagPointRadius * 2 +
        this.flagPointToTextBox +
        this.textBoxFlagWidth
    } else {
      top = this.startPoint.y + this.padding
      left = this.startPoint.x + this.padding
    }

    top = Math.floor(top / store.scaleFactor)
    left = Math.floor(left / store.scaleFactor)

    const fontSize = this.getStrokeWidth() / store.scaleFactor

    this.textArea!.style.top = `${top}px`
    this.textArea!.style.left = `${left}px`
    this.textArea!.style.fontSize = `${fontSize}px`
    this.textArea!.style.lineHeight = `${fontSize + 12}px`
    this.textArea!.value = this.text

    this.mirror!.style.top = `${top}px`
    this.mirror!.style.left = `${left}px`
    this.mirror!.style.fontSize = `${fontSize}px`
    this.mirror!.style.lineHeight = `${fontSize + 12}px`

    this.textArea?.remove()
    this.mirror?.remove()

    this.textEditing = false
    this.offScreenCanvas = null
    this.updateDimensions()
    this.drawToOffScreen()
  }

  destroy() {
    super.destroy()
    this.offScreenCanvas = null
    this.textArea?.remove()
    this.textArea = null
    this.mirror?.remove()
    this.mirror = null
    this.selector = null
  }

  textPositionChanged() {
    this.showHandle = true
    let left = 0
    let top = this.startPoint.y + this.padding
    if (this.textPosition === 'right') {
      this.textPosition = 'left'
      this.startPoint.x =
        this.startPoint.x - this.width + this.padding * 2 + this.flagPointRadius * 2
      left = this.startPoint.x + this.padding
    } else {
      this.textPosition = 'right'
      this.startPoint.x =
        this.startPoint.x + this.width - this.padding * 2 - this.flagPointRadius * 2
      left =
        this.startPoint.x +
        this.padding +
        this.flagPointRadius * 2 +
        this.flagPointToTextBox +
        this.textBoxFlagWidth
    }

    this.draw()

    const store = CapturerStore()
    top = Math.floor(top / store.scaleFactor)
    left = Math.floor(left / store.scaleFactor)

    console.log('top: ', top, left)

    this.textArea!.style.top = `${top}px`
    this.textArea!.style.left = `${left}px`

    this.mirror!.style.top = `${top}px`
    this.mirror!.style.left = `${left}px`
  }

  constructor(type: ShapeItemTypeType, startPoint: Point, strokeColor: string, toolWidth: number) {
    super(type, startPoint, strokeColor, toolWidth)
    this.selector = document.querySelector('#app-capturer-selector')!

    const store = CapturerStore()

    this.flagPointRadius = this.flagPointRadius * store.scaleFactor
    this.padding = this.padding * store.scaleFactor
    this.flagPointToTop = this.flagPointToTop * store.scaleFactor
    this.flagPointToTextBox = this.flagPointToTextBox * store.scaleFactor
    this.textBoxFlagWidth = this.textBoxFlagWidth * store.scaleFactor
    this.textBoxFlagRadius = this.textBoxFlagRadius * store.scaleFactor

    // --- 样式配置常量 ---
    const fontSize = this.getStrokeWidth() / store.scaleFactor
    const fontFamily = 'monospace'
    const minWidth = 50 // 最小宽度 px

    // --- 1. 创建 Textarea ---
    const textArea = document.createElement('textarea')
    textArea.spellcheck = false
    // 基础定位样式
    textArea.style.position = 'absolute'
    const top = this.startPoint.y + this.padding
    const left =
      this.startPoint.x +
      this.padding +
      this.flagPointRadius * 2 +
      this.flagPointToTextBox +
      this.textBoxFlagWidth
    textArea.style.top = `${top / store.scaleFactor}px`
    textArea.style.left = `${left / store.scaleFactor}px`
    textArea.style.zIndex = '19999'
    textArea.style.outline = 'none'

    // 字体与外观样式
    textArea.style.fontSize = `${fontSize}px`
    textArea.style.lineHeight = `${fontSize + 12}px`
    textArea.style.fontFamily = fontFamily
    textArea.style.padding = `0px 10px`
    textArea.style.color = 'rgba(0,0,0,0)'
    textArea.style.caretColor = '#FFFFFF'

    // 关键样式：禁止手动缩放，隐藏滚动条
    textArea.style.resize = 'none'
    textArea.style.overflow = 'hidden'
    textArea.style.whiteSpace = 'pre' // 关键：让内容撑开宽度而不是换行
    textArea.style.minWidth = `${minWidth}px`
    textArea.style.background = 'transparent' // 保持背景透明

    textArea.style.textRendering = 'geometricPrecision'
    textArea.style.backfaceVisibility = 'hidden'
    textArea.style.verticalAlign = 'top'

    // --- 2. 创建影子节点 (Mirror) ---
    // 它的作用是不可见的，但拥有完全一样的样式，用来撑开宽高
    const mirror = document.createElement('div')
    mirror.spellcheck = false

    mirror.style.position = 'absolute'
    mirror.style.pointerEvents = 'none'
    mirror.style.top = `${top / store.scaleFactor}px`
    mirror.style.left = `${left / store.scaleFactor}px`
    mirror.style.zIndex = '19995'

    // 复制影响布局的核心样式
    mirror.style.fontSize = `${fontSize}px`
    mirror.style.lineHeight = `${fontSize + 12}px`
    mirror.style.fontFamily = fontFamily
    mirror.style.padding = `0px 10px`
    mirror.style.color = '#FFFFFF'
    mirror.style.whiteSpace = 'pre' // 保持一致
    mirror.style.minWidth = `${minWidth}px`
    mirror.style.wordBreak = 'keep-all' // 不强制断行

    mirror.style.textRendering = 'geometricPrecision'
    mirror.style.backfaceVisibility = 'hidden'
    mirror.style.verticalAlign = 'top'

    // --- 3. 挂载 DOM ---
    this.selector!.appendChild(textArea)
    this.selector!.appendChild(mirror)

    this.textArea = textArea
    this.mirror = mirror
    this.updateDimensions = this.updateDimensions.bind(this)
    // 事件监听
    const events = ['input', 'paste', 'change', 'keydown', 'keyup']
    events.forEach((event) => {
      this.textArea!.addEventListener(event, this.updateDimensions)
    })

    // 2. 【新增】阻止事件冒泡
    // 防止点击输入框时，触发了外层 Canvas 的 "开始画图" 或 "取消选择" 逻辑
    this.textArea.addEventListener('mousedown', (e) => {
      // e?.preventDefault?.()
      e?.stopPropagation?.()
    })
    this.textArea.addEventListener('click', (e) => {
      // e?.preventDefault?.()
      e?.stopPropagation?.()
    })
    // 防止按键事件（如删除键、空格键）触发截图工具的快捷键
    this.textArea.addEventListener('keydown', (e) => {
      // e?.preventDefault?.()
      e?.stopPropagation?.()
    })

    setTimeout(() => {
      this.textArea?.focus()
    }, 100)

    // 初始化一次大小
    this.updateDimensions()
  }

  /**
   * 核心方法：同步内容并更新尺寸
   */
  private updateDimensions() {
    if (!this.textArea || !this.mirror) return
    this.offScreenCanvas = null
    // 1. 将 textarea 的值同步给 mirror
    // 注意：HTML中换行符如果不处理，在div中可能不占高度，需要加个不可见字符或者处理换行
    const val = this.textArea.value || ' '
    this.text = val
    console.log('updateDimensions val: ', val)
    // 将换行符转为 <br> 或者直接赋值 textContent (如果设置了 white-space: pre)
    // 为了更精确的模拟光标位置的尾部空格，通常加一个零宽空格
    this.mirror.innerHTML = val + '\u200b'

    const dom: HTMLElement = this.mirror!.cloneNode(true) as HTMLElement
    dom.style.zIndex = '-1'
    document.body.appendChild(dom)
    // 触发强制重排以确保尺寸计算准确
    void dom.offsetWidth

    // 2. 获取 mirror 的实际渲染宽高
    const newWidth = dom.offsetWidth
    const newHeight = dom.offsetHeight

    // 3. 赋值给 textarea
    // offsetWidth 包含了 padding 和 border，直接赋值即可
    this.textArea.style.width = `${newWidth}px`
    this.textArea.style.height = `${newHeight}px`
    const store = CapturerStore()

    this.width =
      newWidth * store.scaleFactor +
      this.padding * 2 +
      this.flagPointRadius * 2 +
      this.flagPointToTextBox +
      this.textBoxFlagWidth
    this.height = newHeight * store.scaleFactor + this.padding * 2

    console.log('updateDimensions: ', newWidth, newHeight, this.width, this.height)
    dom.remove()
    this.draw()
  }

  deSelect() {
    console.trace('deSelect !!!!!!')
    this.textEditing = false
    super.deSelect()
    this.textArea?.remove()
    if (this.offScreenCanvas) {
      this.mirror?.remove()
    }
  }

  onToolWidthChanged() {
    console.log('onToolWidthChanged !!!!!!')
    const store = CapturerStore()
    const fontSize = Math.round(this.getStrokeWidth() / store.scaleFactor)
    this.textArea!.style.fontSize = `${fontSize}px`
    this.textArea!.style.lineHeight = `${fontSize + 12}px`
    this.mirror!.style.fontSize = `${fontSize}px`
    this.mirror!.style.lineHeight = `${fontSize + 12}px`
    this.updateDimensions()
    this.offScreenCanvas = null
  }

  onStrokeColorChanged() {
    console.log('onStrokeColorChanged !!!!!!')
  }

  private drawToOffScreen() {
    if (!this.textArea || !this.mirror) return
    const store = CapturerStore()
    const fontSize = Math.round(this.getStrokeWidth() / store.scaleFactor)
    const dom = this.mirror!.cloneNode(true) as HTMLElement
    dom.style.zIndex = '-1'
    document.body.appendChild(dom)
    toCanvasAndSVG(dom, {
      style: {
        textRendering: 'geometricPrecision',
        fontWeight: 'normal',
        fontSize: `${fontSize}px`,
        lineHeight: `${fontSize + 12}px`,
        left: '0px',
        top: '0px',
        display: 'inline-block',
        position: 'relative',
        inset: '0px',
        insetBlock: '0px',
        insetInline: '0px'
      }
    })
      .then(({ canvas }) => {
        this.offScreenCanvas = canvas
        this.draw()
      })
      .catch((err: Error) => {
        console.log('drawToOffScreen error: ', err)
      })
      .finally(() => {
        this.mirror?.remove()
        dom.remove()
      })
  }

  update(endPoint: Point) {
    this.startPoint = endPoint
  }

  checkMouseOnHandle(x: number, y: number) {
    const store = CapturerStore()
    const lineWidth = this.getStrokeWidth() + 2 * store.scaleFactor
    const threshold = lineWidth / 2
    const minX = this.startPoint.x - threshold
    const maxX = this.startPoint.x + this.width + threshold
    const minY = this.startPoint.y - threshold
    const maxY = this.startPoint.y + this.height + threshold

    if (x < minX || x > maxX || y < minY || y > maxY) {
      return undefined
    }
    if (!this.pathCache) {
      return undefined
    }

    const ctx = this.canvasCtx!
    ctx.save()
    const isHit = ctx.isPointInPath(this.pathCache, x, y)
    ctx.restore()
    if (isHit) {
      return {
        handle: this.handles![0],
        shape: this,
        onBorder: false,
        onShape: false
      }
    }
    return undefined
  }

  /**
   * 判断点是否在线上
   * @param x
   * @param y
   */
  isOnBorder(x: number, y: number): boolean {
    return x < 0 && y < 0
  }

  getHandles(): HandleItemType[] {
    if (this.textPosition === 'right') {
      const x = this.startPoint.x + this.padding + this.flagPointRadius
      const y = this.startPoint.y + this.padding + this.flagPointToTop + this.flagPointRadius
      this.handles = [
        {
          x,
          y,
          cursor: 'auto',
          position: 'tag-text-position'
        }
      ]
      return this.handles
    } else {
      const x = this.startPoint.x + this.width - this.padding - this.flagPointRadius
      const y = this.startPoint.y + this.padding + this.flagPointToTop + this.flagPointRadius
      this.handles = [
        {
          x,
          y,
          cursor: 'auto',
          position: 'tag-text-position'
        }
      ]
    }
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
      15: 18,
      20: 26,
      25: 32
    }
    return widths[this.toolWidth] * store.scaleFactor
  }

  reDraw() {
    if (this.offScreenCanvas || this.textEditing) {
      return
    }
    this.drawToOffScreen()
  }

  onMove() {
    // this.drawToOffScreen()
  }

  editContent() {
    this.textEditing = true
    const store = CapturerStore()
    let top = 0
    let left = 0
    if (this.textPosition === 'right') {
      top = this.startPoint.y + this.padding
      left =
        this.startPoint.x +
        this.padding +
        this.flagPointRadius * 2 +
        this.flagPointToTextBox +
        this.textBoxFlagWidth
    } else {
      top = this.startPoint.y + this.padding
      left = this.startPoint.x + this.padding
    }

    top = Math.floor(top / store.scaleFactor)
    left = Math.floor(left / store.scaleFactor)

    this.textArea!.style.top = `${top}px`
    this.textArea!.style.left = `${left}px`

    this.mirror!.style.top = `${top}px`
    this.mirror!.style.left = `${left}px`

    this.selector!.appendChild(this.textArea!)
    this.selector!.appendChild(this.mirror!)

    setTimeout(() => {
      this.textArea!.focus()
    }, 100)
  }

  /**
   * 绘制线
   */
  draw() {
    const ctx = this.canvasCtx!
    if (!ctx) return
    const store = CapturerStore()

    ctx.save()
    ctx.clearRect(0, 0, this.canvas!.width, this.canvas!.height)
    console.trace('draw !!!', this.textPosition)
    this.getHandles()
    /**
     * 画控制点
     */
    if (this.textPosition === 'right') {
      const centerX = this.startPoint.x + this.padding + this.flagPointRadius
      const centerY = this.startPoint.y + this.padding + this.flagPointToTop + this.flagPointRadius
      ctx.beginPath()
      ctx.arc(centerX, centerY, this.flagPointRadius, 0, 2 * Math.PI)
      ctx.closePath()
      ctx.fillStyle = this.strokeColor
      ctx.fill()
      this.pathCache = null
      this.pathCache = new Path2D()
      this.pathCache.arc(centerX, centerY, this.flagPointRadius, 0, 2 * Math.PI)
      this.pathCache.closePath()

      const x =
        this.startPoint.x +
        this.padding +
        this.flagPointRadius * 2 +
        this.flagPointToTextBox +
        this.textBoxFlagWidth
      const y = this.startPoint.y + this.padding
      const width =
        this.width -
        this.padding * 2 -
        this.flagPointRadius * 2 -
        this.flagPointToTextBox -
        this.textBoxFlagWidth
      const height = this.height - this.padding * 2
      ctx.beginPath()
      ctx.roundRect(x, y, width, height, 4 * store.scaleFactor)
      ctx.closePath()
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.fill()

      ctx.beginPath()
      const point1X = centerX + this.flagPointRadius + this.flagPointToTextBox
      const point1Y = centerY

      const point2X = point1X + this.textBoxFlagWidth
      const point2Y = point1Y - this.textBoxFlagRadius

      const point3X = point1X + this.textBoxFlagWidth
      const point3Y = point1Y + this.textBoxFlagRadius

      ctx.moveTo(point1X, point1Y)
      ctx.lineTo(point2X, point2Y)
      ctx.lineTo(point3X, point3Y)
      ctx.closePath()
      ctx.fill()
    } else {
      const centerX = this.startPoint.x + this.width - this.padding - this.flagPointRadius
      const centerY = this.startPoint.y + this.padding + this.flagPointToTop + this.flagPointRadius
      ctx.beginPath()
      ctx.arc(centerX, centerY, this.flagPointRadius, 0, 2 * Math.PI)
      ctx.closePath()
      ctx.fillStyle = this.strokeColor
      ctx.fill()
      this.pathCache = null
      this.pathCache = new Path2D()
      this.pathCache.arc(centerX, centerY, this.flagPointRadius, 0, 2 * Math.PI)
      this.pathCache.closePath()

      const x = this.startPoint.x + this.padding
      const y = this.startPoint.y + this.padding
      const width =
        this.width -
        this.padding * 2 -
        this.flagPointRadius * 2 -
        this.flagPointToTextBox -
        this.textBoxFlagWidth
      const height = this.height - this.padding * 2
      ctx.beginPath()
      ctx.roundRect(x, y, width, height, 4 * store.scaleFactor)
      ctx.closePath()
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.fill()

      ctx.beginPath()
      const point1X = centerX - this.flagPointRadius - this.flagPointToTextBox
      const point1Y = centerY

      const point2X = point1X - this.textBoxFlagWidth
      const point2Y = point1Y - this.textBoxFlagRadius

      const point3X = point1X - this.textBoxFlagWidth
      const point3Y = point1Y + this.textBoxFlagRadius

      ctx.moveTo(point1X, point1Y)
      ctx.lineTo(point2X, point2Y)
      ctx.lineTo(point3X, point3Y)
      ctx.closePath()
      ctx.fill()
    }

    if (
      !this.textEditing &&
      this.offScreenCanvas &&
      this.offScreenCanvas.width &&
      this.offScreenCanvas.height
    ) {
      let x = 0
      let y = 0
      if (this.textPosition === 'right') {
        x =
          this.startPoint.x +
          this.padding +
          this.flagPointRadius * 2 +
          this.flagPointToTextBox +
          this.textBoxFlagWidth
        y = this.startPoint.y + this.padding
      } else {
        x = this.startPoint.x + this.padding
        y = this.startPoint.y + this.padding
      }
      // 绘制离屏画布内容
      ctx.drawImage(this.offScreenCanvas, x, y)
    }

    if (this.showHandle) {
      ctx.strokeStyle = '#F56C6C'
      ctx.lineWidth = 1 * store.scaleFactor
      const offset = 0.5 * store.scaleFactor
      ctx.beginPath()
      ctx.rect(
        this.startPoint.x + offset,
        this.startPoint.y + offset,
        this.width - store.scaleFactor,
        this.height - store.scaleFactor
      )
      ctx.stroke()
    }

    ctx.restore()
  }
}
