import { defineStore } from 'pinia'
import RectSelect from '@/capturer/RectSelector/RectSelect'
import RectCanvas from '@/capturer/RectCanvas/RectCanvas'
import IPC from '@/util/IPC'
import { loadImage } from '@/util/Index'
import localForage from 'localforage'

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
    initTheme() {
      localForage.getItem('flyenv-app-theme').then((res: any) => {
        console.log('flyenv-app-theme: ', res)
        if (res) {
          const html = document.documentElement
          html.classList.remove('dark', 'light')
          html.classList.add(res)
        }
      })
    },
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
    async getCanvas(screenImgStr: string, rectImgStr?: string, rect?: Rect, rectId?: number) {
      try {
        const promises: [Promise<HTMLImageElement>, Promise<HTMLImageElement | null>] = [
          ScreenStore.windowImagesDom[-1]
            ? Promise.resolve(ScreenStore.windowImagesDom[-1])
            : loadImage(screenImgStr),
          rectImgStr && rect ? loadImage(rectImgStr) : Promise.resolve(null)
        ]

        const [bgImg, overlayImg] = await Promise.all(promises)

        if (bgImg && !rectId && !ScreenStore.windowImagesDom[-1]) {
          ScreenStore.windowImagesDom[-1] = bgImg
        }

        if (overlayImg && rectId) {
          ScreenStore.windowImagesDom[rectId] = overlayImg
        }
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
    },

    async exitCapturer() {
      return new Promise((resolve) => {
        IPC.send('Capturer:doStopCapturer').then((key: string) => {
          IPC.off(key)
          resolve(true)
        })
      })
    },
    /**
     * 导出画布为base64字符串
     */
    async exportCanvasToBase64(): Promise<string> {
      /**
       * 选区
       */
      const rect = RectSelect.editRect!
      const rectID = RectSelect.editRectId

      const canvas = document.createElement('canvas')!
      canvas.width = rect.width * this.scaleFactor
      canvas.height = rect.height * this.scaleFactor
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingEnabled = false
      if (rectID) {
        const img = ScreenStore.windowImagesDom[rectID]
        ctx.drawImage(img, 0, 0)
      } else {
        /**
         * 底图
         */
        const baseCanvas = ScreenStore.canvas!
        /**
         * 把baseCanvas的rect选区的图像, 绘制到canvas上
         */
        ctx.drawImage(
          baseCanvas,
          rect.x * this.scaleFactor,
          rect.y * this.scaleFactor,
          rect.width * this.scaleFactor,
          rect.height * this.scaleFactor,
          0,
          0,
          canvas.width,
          canvas.height
        )
      }
      /**
       * 按zIndex从小到大排序的所有叠加图层
       */
      const allShapeLayer = RectCanvas.shape.sort((a, b) => {
        return a.zIndex - b.zIndex
      })
      console.log('allShapeLayer: ', JSON.parse(JSON.stringify(allShapeLayer)))
      /**
       * 排好序的图层画布
       */
      const allCanavsLayer = await Promise.all(allShapeLayer.map((a) => a.exportCanvas()))

      /**
       * 按顺序把图层画布叠加绘制到canvas上
       * 画布大小就是rect的大小, 可以直接绘制到canvas上
       */
      allCanavsLayer.forEach((layerCanvas) => {
        if (layerCanvas && layerCanvas.width && layerCanvas.height) {
          ctx.drawImage(layerCanvas, 0, 0)
        }
      })
      /**
       * 导出canvas为base64字符串
       */
      return canvas.toDataURL('image/png')
    },

    async saveImage(useConfig: boolean) {
      const image = await this.exportCanvasToBase64()
      await this.exitCapturer()
      const base64 = image.replace(/^data:image\/\w+;base64,/, '')
      IPC.send('Capturer:saveImage', base64, useConfig).then((key: string) => {
        IPC.off(key)
      })
    }
  }
})

type ScreenStoreType = {
  canvas: HTMLCanvasElement | undefined | null
  rectCanvas: HTMLCanvasElement | undefined | null
  rectCtx: CanvasRenderingContext2D | undefined | null
  mosaicPattern: CanvasPattern | undefined | null
  createMosaicPattern: (mosaicSize: number) => void
  windowImagesDom: Record<number, HTMLImageElement>
  reinit: () => void
}

export const ScreenStore: ScreenStoreType = {
  /**
   * 屏幕截图画布
   */
  canvas: undefined,
  /**
   * 编辑区域画布
   */
  rectCanvas: undefined,
  rectCtx: undefined,
  /**
   * 马赛克画刷
   */
  mosaicPattern: undefined,
  windowImagesDom: {},

  reinit() {
    ScreenStore.mosaicPattern = null
    ScreenStore.canvas = null
    ScreenStore.rectCanvas = null
    ScreenStore.rectCtx = null
    ScreenStore.windowImagesDom = {}
  },
  createMosaicPattern(mosaicSize: number = 10) {
    if (this.mosaicPattern || !RectSelect.editRect) {
      return
    }

    const store = CapturerStore()
    let { x, y, width, height } = RectSelect.editRect!
    x *= store.scaleFactor
    y *= store.scaleFactor
    width *= store.scaleFactor
    height *= store.scaleFactor

    const sourceCanvas = this.canvas!
    const mainCtx = this.rectCtx!

    // 1. 创建离屏 Canvas，尺寸仅为编辑区域大小
    let offScreen: HTMLCanvasElement | null = document.createElement('canvas')
    let offCtx: CanvasRenderingContext2D | null = offScreen.getContext('2d')!

    offScreen.width = width
    offScreen.height = height

    // 计算缩小后的尺寸
    const sw = width / mosaicSize
    const sh = height / mosaicSize

    /**
     * 核心逻辑调整：
     * 步骤 1：从 sourceCanvas 的 (x, y) 处截取 width/height，缩小绘制到离屏画布上
     */
    offCtx.drawImage(
      sourceCanvas,
      x,
      y,
      width,
      height, // 数据源的截取范围
      0,
      0,
      sw,
      sh // 绘制到离屏画布的缩小目标
    )

    /**
     * 步骤 2：将缩小后的那一小块图，拉伸填满整个离屏画布
     */
    offCtx.imageSmoothingEnabled = false
    offCtx.drawImage(
      offScreen,
      0,
      0,
      sw,
      sh, // 缩小后的源
      0,
      0,
      width,
      height // 拉伸回编辑区大小
    )

    this.mosaicPattern = mainCtx.createPattern(offScreen, 'no-repeat')

    // 释放内存
    offScreen = null
    offCtx = null
  }
}
