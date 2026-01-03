import { HandleItemType, Shape, ShapeItemTypeType } from './Shape'
import type { Point } from './Shape'
import { CapturerStore } from '@/capturer/store/app'
import { toCanvasAndSVG } from '@/util/html-to-image'

export class Text extends Shape {
  // 离屏画布相关属性
  private offScreenCanvas: HTMLCanvasElement | null = null
  private textArea: HTMLTextAreaElement | null = null
  // 新增：影子节点，用于计算宽高
  private mirror: HTMLElement | null = null
  private selector: HTMLElement | null = null
  text: string = ''
  textEditing = true

  historyRedo(record: Text) {
    super.historyRedo(record)
    this.text = record.text
    const store = CapturerStore()
    const top = Math.floor(this.startPoint.y / store.scaleFactor)
    const left = Math.floor(this.startPoint.x / store.scaleFactor)
    const fontSize = Math.round(this.getStrokeWidth() / store.scaleFactor)

    this.textArea!.style.top = `${top}px`
    this.textArea!.style.left = `${left}px`
    this.textArea!.style.fontSize = `${fontSize}px`
    this.textArea!.style.lineHeight = `${fontSize + 12}px`
    this.textArea!.style.caretColor = this.strokeColor
    this.textArea!.value = this.text

    this.mirror!.style.top = `${top}px`
    this.mirror!.style.left = `${left}px`
    this.mirror!.style.fontSize = `${fontSize}px`
    this.mirror!.style.lineHeight = `${fontSize + 12}px`
    this.mirror!.style.color = this.strokeColor

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

  constructor(type: ShapeItemTypeType, startPoint: Point, strokeColor: string, toolWidth: number) {
    super(type, startPoint, strokeColor, toolWidth)
    this.selector = document.querySelector('#app-capturer-selector')!
    const store = CapturerStore()

    // --- 样式配置常量 ---
    const fontSize = Math.round(this.getStrokeWidth() / store.scaleFactor)
    const border = '1px solid #333333'
    const fontFamily = 'monospace'
    const minWidth = 50 // 最小宽度 px

    // --- 1. 创建 Textarea ---
    const textArea = document.createElement('textarea')
    textArea.spellcheck = false
    // 基础定位样式
    textArea.style.position = 'absolute'
    textArea.style.top = `${this.startPoint.y / store.scaleFactor}px`
    textArea.style.left = `${this.startPoint.x / store.scaleFactor}px`
    textArea.style.zIndex = '19999'
    textArea.style.outline = 'none'

    // 字体与外观样式
    textArea.style.border = border
    textArea.style.fontSize = `${fontSize}px`
    textArea.style.fontFamily = fontFamily
    textArea.style.padding = `0 10px`
    textArea.style.lineHeight = `${fontSize + 12}px`
    textArea.style.color = 'rgba(0,0,0,0)'
    textArea.style.caretColor = strokeColor

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
    mirror.style.top = `${this.startPoint.y / store.scaleFactor}px`
    mirror.style.left = `${this.startPoint.x / store.scaleFactor}px`
    mirror.style.zIndex = '19995'

    // 复制影响布局的核心样式
    mirror.style.fontWeight = 'normal'
    mirror.style.display = `inline-block`
    mirror.style.fontSize = `${fontSize}px`
    mirror.style.fontFamily = fontFamily
    mirror.style.padding = `0 10px`
    mirror.style.lineHeight = `${fontSize + 12}px`
    mirror.style.color = strokeColor
    mirror.style.border = '1px solid rgba(0, 0, 0, 0)'
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
    // 四舍五入到整数像素
    const newWidth = Math.ceil(dom.offsetWidth)
    const newHeight = Math.ceil(dom.offsetHeight)

    // 3. 赋值给 textarea
    // offsetWidth 包含了 padding 和 border，直接赋值即可
    this.textArea.style.width = `${newWidth}px`
    this.textArea.style.height = `${newHeight}px`
    const store = CapturerStore()
    this.width = newWidth * store.scaleFactor
    this.height = newHeight * store.scaleFactor
    dom.remove()
    console.log('updateDimensions: ', newWidth, newHeight, this.width, this.height)
  }

  deSelect() {
    this.textEditing = false
    super.deSelect()
    this.textArea?.remove()
    if (this.offScreenCanvas) {
      this.mirror?.remove()
    }
  }

  onToolWidthChanged() {
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
    this.textArea!.style.caretColor = this.strokeColor
    this.mirror!.style.color = this.strokeColor
    this.offScreenCanvas = null
  }

  reDraw() {
    if (this.offScreenCanvas || this.textEditing) {
      return
    }
    this.drawToOffScreen()
  }

  private drawToOffScreen() {
    return new Promise((resolve, reject) => {
      if (!this.textArea || !this.mirror) {
        return reject(new Error('not now'))
      }
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
          resolve(true)
        })
    })
  }

  update(endPoint: Point) {
    this.startPoint = endPoint
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

  onMove() {
    // this.drawToOffScreen()
  }

  editContent() {
    this.textEditing = true
    const store = CapturerStore()
    const top = Math.floor(this.startPoint.y / store.scaleFactor)
    const left = Math.floor(this.startPoint.x / store.scaleFactor)
    this.textArea!.style.top = `${top}px`
    this.textArea!.style.left = `${left}px`

    this.mirror!.style.top = `${top}px`
    this.mirror!.style.left = `${left}px`

    this.selector!.appendChild(this.textArea!)
    this.selector!.appendChild(this.mirror!)
  }

  /**
   * 绘制线
   */
  draw() {
    const ctx = this.canvasCtx!
    if (!ctx) return

    ctx.save()
    ctx.clearRect(0, 0, this.canvas!.width, this.canvas!.height)
    if (this.textEditing || !this.offScreenCanvas) {
      return
    }

    const store = CapturerStore()
    // 绘制离屏画布内容
    console.log('绘制离屏画布内容: ', this.startPoint)
    // 像素对齐：将坐标四舍五入到最接近的整数像素
    if (this.offScreenCanvas && this.offScreenCanvas.width && this.offScreenCanvas.height) {
      const x = Math.floor(this.startPoint.x)
      const y = Math.floor(this.startPoint.y)
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(this.offScreenCanvas, x, y)
    }

    if (this.showHandle) {
      ctx.strokeStyle = '#333333'
      ctx.lineWidth = store.scaleFactor
      // 使用像素对齐的矩形
      ctx.beginPath()
      ctx.rect(
        Math.round(this.startPoint.x + 0.5 * store.scaleFactor),
        Math.round(this.startPoint.y + 0.5 * store.scaleFactor),
        Math.round(this.width - store.scaleFactor),
        Math.round(this.height - store.scaleFactor)
      )
      ctx.stroke()
    }

    ctx.restore()
  }

  async exportCanvas(): Promise<HTMLCanvasElement> {
    if (!this.showHandle && !this.textEditing) {
      return this.canvas!
    }
    this.showHandle = false
    this.textEditing = false
    await this.drawToOffScreen()
    return this.canvas!
  }
}
