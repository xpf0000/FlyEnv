import { defineStore } from 'pinia'

export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

type WindowBoundAndInfo = {
  id: number
  bounds: Rect
  name: string
  image: string
}

export interface MagnifyingInfo {
  show: boolean
  point: {
    x: number
    y: number
    showX: number
    showY: number
  }
  hex: string
  rgb: string
  image: string
  componentWidth: number
  componentHeight: number
}

export interface State {
  screenRect: Rect | undefined
  currentRect?: WindowBoundAndInfo
  screenImage?: string
  windowImages: Record<number, string>
  magnifyingInfo: MagnifyingInfo
  scaleFactor: number
}

const state: State = {
  screenRect: undefined,
  currentRect: undefined,
  screenImage: undefined,
  windowImages: {},
  magnifyingInfo: {
    show: true,
    point: {
      x: 0,
      y: 0,
      showX: 0,
      showY: 0
    },
    hex: '',
    rgb: '',
    image: '',
    componentWidth: 0,
    componentHeight: 0
  },
  scaleFactor: 1
}

export const CapturerStore = defineStore('capturerStore', {
  state: (): State => state,
  getters: {},
  actions: {
    /**
     * 鼠标移动时，获取坐标，坐标点的hex，rgb色值，从ScreenStore.canvas获取放大镜效果的图片
     * 获取到的数据，写入magnifyingInfo
     * @param e
     */
    onWindowMouseMove(e: MouseEvent) {
      if (!this.magnifyingInfo?.show || !ScreenStore.canvas) {
        return
      }

      try {
        const canvas = ScreenStore.canvas
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          console.warn('无法获取Canvas上下文')
          return
        }

        const x = Math.round(e.clientX * this.scaleFactor)
        const y = Math.round(e.clientY * this.scaleFactor)

        // 1. 更新鼠标坐标
        this.magnifyingInfo.point = {
          x: e.clientX,
          y: e.clientY,
          showX: x,
          showY: y
        }

        // 2. 获取鼠标位置像素颜色
        const pixelData = ctx.getImageData(x, y, 1, 1).data
        const [r, g, b] = pixelData

        // 3. 转换为RGB格式
        this.magnifyingInfo.rgb = `${r}, ${g}, ${b}`

        // 4. 转换为HEX格式
        this.magnifyingInfo.hex = this.rgbToHex(r, g, b)

        // 5. 生成放大镜效果的图片
        this.magnifyingInfo.image = this.getMagnifyingGlassImage(x, y, canvas)
      } catch (error) {
        console.error('鼠标移动处理出错:', error)
      }
    },

    /**
     * 将RGB颜色转换为HEX格式
     * @param r 红色值 (0-255)
     * @param g 绿色值 (0-255)
     * @param b 蓝色值 (0-255)
     * @returns HEX颜色字符串
     */
    rgbToHex(r: number, g: number, b: number): string {
      return (
        '#' +
        r.toString(16).padStart(2, '0') +
        g.toString(16).padStart(2, '0') +
        b.toString(16).padStart(2, '0')
      )
    },

    /**
     * 获取放大镜效果的图片
     * @param x 鼠标X坐标
     * @param y 鼠标Y坐标
     * @param sourceCanvas 源Canvas
     * @param magnifyFactor 放大倍数
     * @returns 放大镜图片的DataURL
     */
    getMagnifyingGlassImage(
      x: number,
      y: number,
      sourceCanvas: HTMLCanvasElement,
      magnifyFactor: number = 4
    ): string {
      const sourceCtx = sourceCanvas.getContext('2d')
      if (!sourceCtx) return ''

      // 1. 定义逻辑尺寸 (CSS 展示的大小)
      const LOGICAL_W = 120
      const LOGICAL_H = 80

      // 2. 定义物理尺寸 (Canvas 内部像素点)
      // 必须乘以 scaleFactor 保证在高分屏上不模糊
      const canvasWidth = Math.round(LOGICAL_W * this.scaleFactor)
      const canvasHeight = Math.round(LOGICAL_H * this.scaleFactor)

      const magnifyCanvas = document.createElement('canvas')
      magnifyCanvas.width = canvasWidth
      magnifyCanvas.height = canvasHeight

      const magnifyCtx = magnifyCanvas.getContext('2d', { willReadFrequently: true })
      if (!magnifyCtx) return ''

      // 【关键点 1】禁用平滑处理，产生像素颗粒感
      magnifyCtx.imageSmoothingEnabled = false

      const realX = x
      const realY = y

      // 计算采样区域（在物理像素尺度下）
      // 采样宽度 = 放大镜宽度 / 放大倍数
      const sampleWidth = Math.floor(canvasWidth / magnifyFactor)
      const sampleHeight = Math.floor(canvasHeight / magnifyFactor)

      // 采样起始点（以鼠标为中心）
      const sourceX = realX - Math.floor(sampleWidth / 2)
      const sourceY = realY - Math.floor(sampleHeight / 2)

      try {
        // 3. 绘制放大的图像
        magnifyCtx.drawImage(
          sourceCanvas,
          sourceX,
          sourceY,
          sampleWidth,
          sampleHeight, // 源：截取小块
          0,
          0,
          canvasWidth,
          canvasHeight // 目标：铺满画布
        )

        // --- 绘制 UI 装饰性元素 ---

        // 4. 绘制中心准星（通常这种像素风格的准星不需要平滑）
        magnifyCtx.lineWidth = this.scaleFactor // 线宽随缩放适配

        // 准星颜色建议使用反差色或带阴影，防止在纯白背景看不见
        const centerX = canvasWidth / 2
        const centerY = canvasHeight / 2

        // 白色半透明十字
        magnifyCtx.strokeStyle = '#409eff'
        magnifyCtx.beginPath()
        // 垂直
        magnifyCtx.moveTo(centerX, 0)
        magnifyCtx.lineTo(centerX, canvasHeight)
        // 水平
        magnifyCtx.moveTo(0, centerY)
        magnifyCtx.lineTo(canvasWidth, centerY)
        magnifyCtx.stroke()

        return magnifyCanvas.toDataURL('image/png')
      } catch (error) {
        console.error('放大镜绘制失败:', error)
        return ''
      }
    },

    /**
     * 生成原始分辨率的图像
     * @param screenImgStr 背景图 base64
     * @param rectImgStr 选区图 base64
     * @param rect 屏幕上的选区位置
     */
    async getCanvas(screenImgStr: string, rectImgStr?: string, rect?: Rect) {
      const loadImage = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image()
          img.src = src
          img
            .decode()
            .then(() => resolve(img))
            .catch(reject)
        })
      }

      try {
        const promises: [Promise<HTMLImageElement>, Promise<HTMLImageElement | null>] = [
          loadImage(screenImgStr),
          rectImgStr && rect ? loadImage(rectImgStr) : Promise.resolve(null)
        ]

        const [bgImg, overlayImg] = await Promise.all(promises)

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return

        // 【关键点 1】禁用平滑处理，产生像素颗粒感
        ctx.imageSmoothingEnabled = false

        // --- 比例计算核心 ---
        // 原始宽度 (例如 1920) / 当前屏幕宽度 (例如 1580)
        const realWidth = bgImg.naturalWidth
        const realHeight = bgImg.naturalHeight

        const scaleX = this.scaleFactor
        const scaleY = this.scaleFactor

        // 设置 Canvas 为图片的真实物理尺寸
        canvas.width = realWidth
        canvas.height = realHeight

        // 1. 绘制背景图（1:1 绘制，不缩放）
        ctx.drawImage(bgImg, 0, 0, realWidth, realHeight)

        // 2. 绘制叠加图
        if (overlayImg && rect) {
          // 将屏幕上的坐标和宽高，按比例放大到真实尺寸
          const realRectX = rect.x * scaleX
          const realRectY = rect.y * scaleY
          const realRectW = rect.width * scaleX
          const realRectH = rect.height * scaleY

          ctx.drawImage(overlayImg, realRectX, realRectY, realRectW, realRectH)
        }

        // 3. 存储结果
        ScreenStore.canvas = canvas
        console.log(`高清图像生成成功: ${realWidth}x${realHeight}, 缩放比例: ${scaleX.toFixed(2)}`)
      } catch (error) {
        console.error('生成高清图失败:', error)
      }
    }
  }
})

type ScreenStoreType = {
  canvas: HTMLCanvasElement | undefined
  rectCanvas: HTMLCanvasElement | undefined
  rectCtx: CanvasRenderingContext2D | undefined | null
}

export const ScreenStore: ScreenStoreType = {
  canvas: undefined,
  rectCanvas: undefined,
  rectCtx: undefined
}
