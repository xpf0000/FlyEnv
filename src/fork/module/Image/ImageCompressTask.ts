import type { TaskItem } from '@shared/TaskQueue'
import sharp, { Sharp, FitEnum, KernelEnum, OverlayOptions, FormatEnum } from 'sharp'
import type {
  ImageWatermarkOptions,
  SharpConfig,
  TextureOptions,
  TextWatermarkOptions,
  WatermarkConfig,
  WatermarkPosition
} from './imageCompress.type'
import fs from 'fs/promises'
import path from 'path'
import { ImageInfoFetchTask } from './ImageInfoFetchTask'

export class ImageCompressTask implements TaskItem {
  /** 需要处理的图片 */
  image: ImageInfoFetchTask
  /** sharp配置 */
  config: SharpConfig
  /** 处理后的文件大小 */
  size: number = 0
  /** 格式化后的文件大小字符串 */
  sizeFormatted: string = ''
  /** 处理后的图片宽度 */
  width: number = 0
  /** 处理后的图片高度 */
  height: number = 0
  /** 处理后的图片格式 */
  ext = ''
  /** 压缩比 */
  compressionRatio: number = 0
  /**
   * 缩小比例
   */
  sizePercentage: string = ''
  /** 是否应用了水印 */
  hasWatermark: boolean = false
  /** 是否应用了纹理 */
  hasTexture: boolean = false
  /** 文件状态 */
  hasError: boolean = false
  /** 错误信息 */
  errorMessage: string = ''

  constructor(image: ImageInfoFetchTask, config: SharpConfig) {
    this.image = image
    this.config = config
  }

  /** 格式化文件大小 */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const k = 1024
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`
  }

  /** 获取压缩后的文件大小 */
  private async getFileSize(): Promise<boolean> {
    try {
      const stats = await fs.stat(this.config.path)
      this.size = stats.size
      this.sizeFormatted = this.formatFileSize(stats.size)
      if (this.image.size > 0) {
        this.sizePercentage = `${(((this.image.size - this.size) / this.image.size) * 100).toFixed(2)}%`
        this.compressionRatio = this.image.size / this.size
      }
      return true
    } catch (error: any) {
      this.errorMessage = `获取文件大小失败: ${error.message}`
      this.hasError = true
      return false
    }
  }

  /** 获取压缩后的图片元数据 */
  private async getImageMetadata(): Promise<boolean> {
    try {
      const metadata = await sharp(this.config.path).metadata()
      this.width = metadata.width || 0
      this.height = metadata.height || 0

      if (metadata.format) {
        this.ext = metadata.format.toLowerCase()
      } else {
        const fileExt = path.extname(this.config.path).toLowerCase().replace('.', '')
        this.ext = fileExt || 'unknown'
      }
      return true
    } catch (error: any) {
      this.errorMessage = `获取压缩后图片元数据失败: ${error.message}`
      this.hasError = true
      return false
    }
  }

  /** 应用 trim 操作 */
  private applyTrim(pipeline: Sharp): Sharp {
    if (this.config.trim) {
      return pipeline.trim({
        threshold: 0
      })
    }
    return pipeline
  }

  /**
   * 创建文字水印SVG
   * @param options 文字水印配置
   * @param width 水印宽度
   * @param height 水印高度
   * @returns SVG字符串
   */
  private createTextWatermarkSVG(
    options: TextWatermarkOptions,
    width: number,
    height: number
  ): string {
    const {
      text,
      fontSize = 24,
      color = '#FFFFFF',
      opacity = 0.8,
      backgroundColor,
      shadow
    } = options

    const hasBackground = !!backgroundColor
    const shadowStyle = shadow
      ? `
      <filter id="shadow">
        <feDropShadow
          dx="${shadow.offsetX || 1}"
          dy="${shadow.offsetY || 1}"
          stdDeviation="${shadow.blur || 2}"
          flood-color="${shadow.color || 'rgba(0,0,0,0.5)'}"
          flood-opacity="${opacity}"
        />
      </filter>
    `
      : ''

    const backgroundRect = hasBackground
      ? `
      <rect
        x="0" y="0"
        width="${width}" height="${height}"
        fill="${backgroundColor}"
        opacity="${opacity}"
      />
    `
      : ''

    const textStyle = `
      font-size: ${fontSize}px;
      font-family: monospace;
      font-weight: bold;
      fill: ${color};
      opacity: ${opacity};
      text-anchor: middle;
      dominant-baseline: middle;
      ${shadow ? 'filter: url(#shadow);' : ''}
    `

    return `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        ${shadowStyle}
        ${backgroundRect}
        <text
          x="${width / 2}"
          y="${height / 2}"
          style="${textStyle}"
        >
          ${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
        </text>
      </svg>
    `
  }

  /**
   * 计算水印位置
   * @param position 位置配置
   * @param baseWidth 基准图片宽度
   * @param baseHeight 基准图片高度
   * @param watermarkWidth 水印宽度
   * @param watermarkHeight 水印高度
   * @returns 水印左上角坐标
   */
  private calculateWatermarkPosition(
    position: WatermarkPosition,
    baseWidth: number,
    baseHeight: number,
    watermarkWidth: number,
    watermarkHeight: number
  ): { left: number; top: number } {
    const { horizontal = 'right', vertical = 'bottom', offsetX = 20, offsetY = 20 } = position

    let left = 0
    let top = 0

    // 计算水平位置
    switch (horizontal) {
      case 'left':
        left = offsetX
        break
      case 'center':
        left = Math.floor((baseWidth - watermarkWidth) / 2)
        break
      case 'right':
        left = baseWidth - watermarkWidth - offsetX
        break
    }

    // 计算垂直位置
    switch (vertical) {
      case 'top':
        top = offsetY
        break
      case 'middle':
        top = Math.floor((baseHeight - watermarkHeight) / 2)
        break
      case 'bottom':
        top = baseHeight - watermarkHeight - offsetY
        break
    }

    return { left: Math.max(0, left), top: Math.max(0, top) }
  }

  /**
   * 应用图片水印效果
   * @param watermarkPipeline 水印处理管道
   * @param imageOptions 图片水印配置
   * @returns 处理后的水印管道
   */
  private async applyImageWatermarkEffects(
    watermarkPipeline: Sharp,
    imageOptions: ImageWatermarkOptions,
    width: number,
    height: number
  ): Promise<Sharp> {
    try {
      const { opacity, rotate } = imageOptions

      // 如果设置了透明度，确保有alpha通道
      if (opacity !== undefined && opacity < 1) {
        watermarkPipeline = watermarkPipeline.ensureAlpha()
        // 创建半透明蒙版
        const overlayColor = { r: 0, g: 0, b: 0, alpha: opacity }

        // 创建一个相同尺寸的半透明层
        const overlay = await sharp({
          create: {
            width: width,
            height: height,
            channels: 4,
            background: overlayColor
          }
        })
          .png()
          .toBuffer()

        // 通过blend模式应用透明度
        watermarkPipeline = watermarkPipeline.composite([
          {
            input: overlay,
            blend: 'dest-in'
          }
        ])
      }

      // 应用旋转
      if (rotate) {
        watermarkPipeline = watermarkPipeline.rotate(rotate, {
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
      }

      return watermarkPipeline
    } catch (error: any) {
      console.warn(`应用图片水印效果失败: ${error.message}`)
      return watermarkPipeline
    }
  }

  /**
   * 应用单个水印
   * @param pipeline 图片处理管道
   * @param watermarkConfig 水印配置
   * @param baseWidth 基准图片宽度
   * @param baseHeight 基准图片高度
   * @returns 应用水印后的管道
   */
  private async applySingleWatermark(
    pipeline: Sharp,
    watermarkConfig: WatermarkConfig,
    baseWidth: number,
    baseHeight: number
  ): Promise<Sharp> {
    if (!watermarkConfig.enabled) {
      return pipeline
    }

    const { type, content, position = {}, repeat = 'single', spacing = 100 } = watermarkConfig

    try {
      if (type === 'text') {
        const textOptions = content as TextWatermarkOptions

        // 计算文字水印尺寸
        const fontSize = textOptions.fontSize || 24
        const padding = textOptions.padding || 4
        const textWidth = Math.ceil(textOptions.text.length * fontSize) + padding * 2
        const textHeight = fontSize + padding * 2

        // 创建文字水印SVG
        const svg = this.createTextWatermarkSVG(textOptions, textWidth, textHeight)
        console.log('applySingleWatermark text svg: ', svg)
        const watermarkBuffer = Buffer.from(svg)

        if (repeat === 'single') {
          // 单水印模式
          const { left, top } = this.calculateWatermarkPosition(
            position,
            baseWidth,
            baseHeight,
            textWidth,
            textHeight
          )

          console.log('calculateWatermarkPosition left:', left, top)

          return pipeline.composite([
            {
              input: watermarkBuffer,
              top,
              left,
              blend: 'over'
              // premultiplied: true
            }
          ])
        } else {
          // 重复水印模式
          const overlays: OverlayOptions[] = []
          const horizontalCount = Math.ceil(baseWidth / (textWidth + spacing))
          const verticalCount = Math.ceil(baseHeight / (textHeight + spacing))

          for (let i = 0; i < horizontalCount; i++) {
            for (let j = 0; j < verticalCount; j++) {
              const left = i * (textWidth + spacing)
              const top = j * (textHeight + spacing)

              if (left < baseWidth && top < baseHeight) {
                overlays.push({
                  input: watermarkBuffer,
                  top,
                  left,
                  blend: 'over'
                  // premultiplied: true
                })
              }
            }
          }

          return pipeline.composite(overlays)
        }
      } else if (type === 'image') {
        const imageOptions = content as ImageWatermarkOptions

        // 加载水印图片
        let watermarkPipeline = sharp(imageOptions.imagePath)
        const watermarkMetadata = await watermarkPipeline.metadata()

        if (!watermarkMetadata.width || !watermarkMetadata.height) {
          throw new Error('无法获取水印图片尺寸')
        }

        // 计算水印图片尺寸
        let watermarkWidth = watermarkMetadata.width
        let watermarkHeight = watermarkMetadata.height

        if (imageOptions.width || imageOptions.height) {
          let targetWidth = 0
          if (imageOptions.width) {
            targetWidth =
              typeof imageOptions.width === 'string' && imageOptions.width.endsWith('%')
                ? Math.floor((baseWidth * parseFloat(imageOptions.width)) / 100)
                : Number(imageOptions.width)
          }
          let targetHeight = 0
          if (imageOptions.height) {
            targetHeight =
              typeof imageOptions.height === 'string' && imageOptions.height.endsWith('%')
                ? Math.floor((baseHeight * parseFloat(imageOptions.height)) / 100)
                : Number(imageOptions.height)
          }
          const option: any = {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
            withoutEnlargement: false
          }
          if (targetWidth && !isNaN(targetWidth)) {
            option.width = targetWidth
          }
          if (targetHeight && !isNaN(targetHeight)) {
            option.height = targetHeight
          }
          console.log('watermarkPipeline.resize(option): ', option)
          watermarkPipeline = watermarkPipeline.resize(option)
          const clone = watermarkPipeline.clone()
          const { info } = await clone.toBuffer({
            resolveWithObject: true
          })
          watermarkWidth = info.width
          watermarkHeight = info.height
          console.log('watermarkPipeline watermarkWidth: ', watermarkWidth, watermarkHeight)
        }

        // 应用水印图片效果
        watermarkPipeline = await this.applyImageWatermarkEffects(
          watermarkPipeline,
          imageOptions,
          watermarkWidth,
          watermarkHeight
        )

        const watermarkBuffer = await watermarkPipeline.toBuffer()

        if (repeat === 'single') {
          // 单水印模式
          const { left, top } = this.calculateWatermarkPosition(
            position,
            baseWidth,
            baseHeight,
            watermarkWidth,
            watermarkHeight
          )

          return pipeline.composite([
            {
              input: watermarkBuffer,
              top,
              left,
              blend: 'over'
              // premultiplied: true
            }
          ])
        } else {
          // 重复水印模式
          const overlays: OverlayOptions[] = []
          const horizontalCount = Math.ceil(baseWidth / (watermarkWidth + spacing))
          const verticalCount = Math.ceil(baseHeight / (watermarkHeight + spacing))

          for (let i = 0; i < horizontalCount; i++) {
            for (let j = 0; j < verticalCount; j++) {
              const left = i * (watermarkWidth + spacing)
              const top = j * (watermarkHeight + spacing)

              if (left < baseWidth && top < baseHeight) {
                overlays.push({
                  input: watermarkBuffer,
                  top,
                  left,
                  blend: 'over'
                  // premultiplied: true
                })
              }
            }
          }

          return pipeline.composite(overlays)
        }
      }

      return pipeline
    } catch (error: any) {
      console.warn(`应用水印失败: ${error.message}`)
      return pipeline
    }
  }

  /**
   * 应用水印功能
   * @param pipeline 图片处理管道
   * @param baseWidth 基准图片宽度
   * @param baseHeight 基准图片高度
   * @returns 应用水印后的管道
   */
  async applyWatermark(pipeline: Sharp, baseWidth: number, baseHeight: number): Promise<Sharp> {
    if (!this.config.watermark) {
      return pipeline
    }

    console.log('applyWatermark this.config.watermark: ', this.config.watermark)

    try {
      this.hasWatermark = true

      if (Array.isArray(this.config.watermark)) {
        // 多个水印
        for (const watermarkConfig of this.config.watermark) {
          if (watermarkConfig.enabled !== false) {
            pipeline = await this.applySingleWatermark(
              pipeline,
              watermarkConfig,
              baseWidth,
              baseHeight
            )
          }
        }
      } else {
        // 单个水印
        if (this.config.watermark.enabled !== false) {
          pipeline = await this.applySingleWatermark(
            pipeline,
            this.config.watermark,
            baseWidth,
            baseHeight
          )
        }
      }

      return pipeline
    } catch (error: any) {
      console.warn(`水印处理失败: ${error.message}`)
      return pipeline
    }
  }

  /**
   * 创建栅格纹理
   * @param options 纹理配置
   * @param width 纹理宽度
   * @param height 纹理高度
   * @returns 纹理图片Buffer
   */
  private async createTexture(
    options: TextureOptions,
    width: number,
    height: number
  ): Promise<Buffer> {
    const {
      type = 'grid',
      color = 'rgba(255,255,255,0.1)',
      size = 20,
      lineWidth = 1,
      dotSize = 2,
      intensity = 0.05,
      customImage,
      opacity = 0.3,
      angle = 0,
      scale = 1
    } = options

    try {
      if (type === 'custom' && customImage) {
        // 使用自定义图片作为纹理
        let texturePipeline = sharp(customImage)

        // 调整纹理大小
        const scaledWidth = Math.floor(width * scale)
        const scaledHeight = Math.floor(height * scale)
        texturePipeline = texturePipeline.resize({
          width: scaledWidth,
          height: scaledHeight,
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })

        // 旋转纹理
        if (angle % 360 !== 0) {
          texturePipeline = texturePipeline.rotate(angle, {
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
        }
        const clone = texturePipeline.clone()
        const { info } = await clone.toBuffer({ resolveWithObject: true })
        clone.destroy()

        if (info.width > width || info.height > height) {
          texturePipeline = texturePipeline.resize({
            width,
            height,
            fit: 'contain'
          })
        }

        // 应用透明度
        if (opacity < 1) {
          // 正确的方法：创建透明蒙版
          texturePipeline = texturePipeline.composite([
            {
              input: {
                create: {
                  width: width,
                  height: height,
                  channels: 4,
                  background: { r: 0, g: 0, b: 0, alpha: opacity }
                }
              },
              blend: 'dest-in'
            }
          ])
        }

        return await texturePipeline.toBuffer()
      }

      // 创建SVG纹理
      let svg = ''
      const scaledSize = Math.max(1, Math.floor(size * scale))
      const scaledLineWidth = Math.max(1, Math.floor(lineWidth * scale))
      const scaledDotSize = Math.max(1, Math.floor(dotSize * scale))

      let textureWidth = width
      let textureHeight = height
      if (angle % 360 !== 0) {
        // 计算旋转后需要的精确尺寸
        const rad = (Math.abs(angle) * Math.PI) / 180
        const cos = Math.cos(rad)
        const sin = Math.sin(rad)

        // 旋转后需要的尺寸计算公式
        const rotatedWidth = Math.ceil(Math.abs(width * cos) + Math.abs(height * sin))
        const rotatedHeight = Math.ceil(Math.abs(width * sin) + Math.abs(height * cos))

        console.log('rotatedWidth', rotatedWidth, rotatedHeight, width, height)

        // 确保旋转后的尺寸足够覆盖原始区域
        textureWidth = Math.max(width, rotatedWidth)
        textureHeight = Math.max(height, rotatedHeight)
      }

      switch (type) {
        case 'grid':
          // 网格纹理
          svg = `
          <svg width="${textureWidth}" height="${textureHeight}" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="${scaledSize}" height="${scaledSize}" patternUnits="userSpaceOnUse">
                <path d="M ${scaledSize} 0 L 0 0 0 ${scaledSize}" fill="none" stroke="${color}" stroke-width="${scaledLineWidth}"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)"/>
          </svg>
        `
          break

        case 'dot':
          // 点状纹理
          svg = `
          <svg width="${textureWidth}" height="${textureWidth}" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="dot" width="${scaledSize}" height="${scaledSize}" patternUnits="userSpaceOnUse">
                <circle cx="${scaledSize / 2}" cy="${scaledSize / 2}" r="${scaledDotSize}" fill="${color}"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dot)"/>
          </svg>
        `
          break

        case 'line':
          // 线条纹理
          svg = `
          <svg width="${textureWidth}" height="${textureWidth}" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="line" width="${scaledSize}" height="${scaledSize}" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="${scaledSize}" y2="${scaledSize}" stroke="${color}" stroke-width="${scaledLineWidth}"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#line)"/>
          </svg>
        `
          break

        case 'noise':
          {
            // 创建小尺寸的噪点纹理，然后平铺
            const tileSize = 64 // 纹理块大小

            // 1. 生成一个小的噪点块
            const tilePixels = tileSize * tileSize * 4
            const tileData = Buffer.alloc(tilePixels)

            for (let i = 0; i < tilePixels; i += 4) {
              const value = Math.floor(Math.random() * 255 * intensity)
              tileData[i] = value
              tileData[i + 1] = value
              tileData[i + 2] = value
              tileData[i + 3] = Math.floor(opacity * 255)
            }

            const tileBuffer = await sharp(tileData, {
              raw: {
                width: tileSize,
                height: tileSize,
                channels: 4
              }
            })
              .png()
              .toBuffer()

            // 2. 通过SVG平铺小纹理
            svg = `
    <svg width="${textureWidth}" height="${textureWidth}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="noise" width="${tileSize}" height="${tileSize}" patternUnits="userSpaceOnUse">
          <image
            href="data:image/png;base64,${tileBuffer.toString('base64')}"
            width="${tileSize}"
            height="${tileSize}"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#noise)"/>
    </svg>
  `
          }
          break
      }

      if (svg) {
        console.log('texturePipeline svg: ', svg)
        let texturePipeline = sharp(Buffer.from(svg))

        // 旋转纹理
        if (angle % 360 !== 0) {
          texturePipeline = texturePipeline.rotate(angle, {
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })

          const clone = texturePipeline.clone()
          const { info } = await clone.toBuffer({ resolveWithObject: true })
          textureWidth = info.width
          textureHeight = info.height
          clone.destroy()

          if (textureWidth > width && textureHeight > height) {
            const left = Math.floor((textureWidth - width) / 2)
            const top = Math.floor((textureHeight - height) / 2)
            const rect = {
              left,
              top,
              width,
              height
            }
            texturePipeline = texturePipeline.extract(rect)
          }
        }

        // 应用透明度
        if (opacity < 1) {
          texturePipeline = texturePipeline.ensureAlpha()
          texturePipeline = texturePipeline.composite([
            {
              input: {
                create: {
                  width: width,
                  height: height,
                  channels: 4,
                  background: { r: 0, g: 0, b: 0, alpha: opacity }
                }
              },
              blend: 'dest-in'
            }
          ])
        }

        return await texturePipeline.toBuffer()
      }

      return Buffer.alloc(0)
    } catch (error: any) {
      console.warn(`创建纹理失败: ${error.message}`)
      return Buffer.alloc(0)
    }
  }

  /**
   * 应用纹理
   * @param pipeline 图片处理管道
   * @param baseWidth 基准图片宽度
   * @param baseHeight 基准图片高度
   * @returns 应用纹理后的管道
   */
  async applyTexture(pipeline: Sharp, baseWidth: number, baseHeight: number): Promise<Sharp> {
    if (!this.config?.texture?.enabled) {
      return pipeline
    }

    try {
      this.hasTexture = true
      const textureBuffer = await this.createTexture(this.config.texture, baseWidth, baseHeight)

      if (textureBuffer.length === 0) {
        return pipeline
      }

      const blendMode = this.config.texture.blendMode || 'overlay'

      return pipeline.composite([
        {
          input: textureBuffer,
          top: 0,
          left: 0,
          blend: blendMode as any
          // premultiplied: true
        }
      ])
    } catch (error: any) {
      console.warn(`应用纹理失败: ${error.message}`)
      return pipeline
    }
  }

  private buildSharpPipeline(): Sharp {
    let pipeline = sharp(this.image.path)
    // 应用 trim
    pipeline = this.applyTrim(pipeline)
    // 调整大小
    if (this.config.width || this.config.height) {
      pipeline = pipeline.resize({
        width: this.config.width,
        height: this.config.height,
        fit: (this.config.fit as keyof FitEnum) || 'contain',
        position: this.config.position || 'center',
        kernel: (this.config.kernel as keyof KernelEnum) || 'lanczos3',
        withoutEnlargement: this.config.withoutEnlargement !== false,
        withoutReduction: this.config.withoutReduction || false,
        fastShrinkOnLoad: this.config.fastShrinkOnLoad !== false
      })
    }

    // 其他处理操作...
    if (this.config.rotate) pipeline = pipeline.rotate(this.config.rotate)
    if (this.config.flip) pipeline = pipeline.flip()
    if (this.config.flop) pipeline = pipeline.flop()
    if (this.config.blur) pipeline = pipeline.blur(this.config.blur)
    if (this.config.sharpen && this.config.sharpen.sigma > 0)
      pipeline = pipeline.sharpen({ sigma: this.config.sharpen.sigma })
    if (this.config.grayscale) pipeline = pipeline.grayscale()
    if (this.config.gamma) pipeline = pipeline.gamma(this.config.gamma)
    if (this.config.negate) pipeline = pipeline.negate()
    if (this.config.median) pipeline = pipeline.median(this.config.median)
    if (this.config.threshold?.enabled) pipeline = pipeline.threshold(this.config.threshold.value)
    if (this.config.modulate) pipeline = pipeline.modulate(this.config.modulate)
    if (this.config.toColorspace) pipeline = pipeline.toColorspace(this.config.toColorspace as any)
    if (this.config.removeAlpha) pipeline = pipeline.removeAlpha()
    if (this.config.ensureAlpha !== undefined)
      pipeline = pipeline.ensureAlpha(this.config.ensureAlpha)
    // if (this.config.extend) pipeline = pipeline.extend(this.config.extend)
    // if (this.config.extract) pipeline = pipeline.extract(this.config.extract)
    return pipeline
  }

  private applyFormatOptions(pipeline: Sharp, format: keyof FormatEnum): Sharp {
    switch (format) {
      case 'jpeg':
      case 'jpg':
        return pipeline.jpeg(
          this.config.compressOpen ? this.config.jpeg || { quality: 80 } : undefined
        )
      case 'png':
        return pipeline.png(
          this.config.compressOpen ? this.config.png || { compressionLevel: 9 } : undefined
        )
      case 'webp':
        return pipeline.webp(
          this.config.compressOpen ? this.config.webp || { quality: 80 } : undefined
        )
      case 'avif':
        return pipeline.avif(
          this.config.compressOpen ? this.config.avif || { quality: 50 } : undefined
        )
      case 'gif':
        return pipeline.gif(this.config.gif)
      case 'tiff':
        return pipeline.tiff(this.config.tiff)
      case 'heif':
        return pipeline.heif(this.config.heif)
      default:
        return pipeline
    }
  }

  async applyOpacity(
    pipeline: Sharp,
    opacity: number,
    width?: number,
    height?: number
  ): Promise<Sharp> {
    if (width && height) {
      pipeline = pipeline.ensureAlpha()
      pipeline = pipeline.composite([
        {
          input: {
            create: {
              width: width,
              height: height,
              channels: 4,
              background: { r: 0, g: 0, b: 0, alpha: opacity }
            }
          },
          blend: 'dest-in'
        }
      ])
      return pipeline
    }
    let clone: any = pipeline.clone()
    const { info } = await clone.toBuffer({ resolveWithObject: true })
    clone.destroy()
    clone = null
    pipeline = pipeline.ensureAlpha()
    pipeline = pipeline.composite([
      {
        input: {
          create: {
            width: info.width,
            height: info.height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: opacity }
          }
        },
        blend: 'dest-in'
      }
    ])
    return pipeline
  }

  /**
   * 保存图片 - 核心逻辑重构
   * 采用 Buffer 中转方案，彻底解决双重处理和元数据获取问题
   */
  private async saveImage(pipeline: Sharp): Promise<boolean> {
    try {
      const outputDir = path.dirname(this.config.path)
      await fs.mkdir(outputDir, { recursive: true })

      let format: 'none' | keyof FormatEnum = 'jpeg'
      if (this.config.format && this.config.format !== 'none') {
        format = this.config.format
      } else {
        const ext = path.extname(this.config.path).toLowerCase().replace('.', '')
        if (['jpeg', 'jpg', 'png', 'webp', 'avif', 'gif', 'tiff', 'heif'].includes(ext)) {
          format = ext as keyof FormatEnum
        }
      }

      // 优化路径: 如果没有水印和纹理，直接处理保存，避免 Buffer 复制开销
      if (!this.config.watermark?.enabled && !this.config.texture?.enabled) {
        pipeline = this.applyFormatOptions(pipeline, format)
        // 应用透明度
        if (typeof this.config.opacity === 'number' && this.config.opacity < 1) {
          pipeline = await this.applyOpacity(pipeline, this.config.opacity)
        }

        if (this.config.withMetadata !== false) pipeline = pipeline.withMetadata()
        if (this.config.withIccProfile)
          pipeline = pipeline.withIccProfile(this.config.withIccProfile)
        if (this.config.timeoutSeconds)
          pipeline = pipeline.timeout({ seconds: this.config.timeoutSeconds })

        await pipeline.toFile(this.config.path)
        return true
      }

      // 复杂路径: 有水印或纹理
      // 1. 先执行基础形变 (Resize/Trim/Rotate)，输出到 Buffer
      // resolveWithObject: true 可以让我们同时拿到处理后的 buffer 和图片信息(width/height)
      const { data: buffer, info } = await pipeline.toBuffer({ resolveWithObject: true })

      // 2. 基于中间 Buffer 创建新的处理流
      let finalPipeline = sharp(buffer)
      const baseWidth = info.width
      const baseHeight = info.height

      // 3. 应用特效 (此时已确切知道基础尺寸)
      if (this.config.texture?.enabled) {
        finalPipeline = await this.applyTexture(finalPipeline, baseWidth, baseHeight)
      }
      if (this.config.watermark?.enabled) {
        finalPipeline = await this.applyWatermark(finalPipeline, baseWidth, baseHeight)
      }

      // 4. 应用输出格式和元数据
      finalPipeline = this.applyFormatOptions(finalPipeline, format)

      // 应用透明度
      if (typeof this.config.opacity === 'number' && this.config.opacity < 1) {
        finalPipeline = await this.applyOpacity(finalPipeline, this.config.opacity)
      }

      if (this.config.withMetadata !== false) {
        finalPipeline = finalPipeline.withMetadata()
      }
      if (this.config.withIccProfile) {
        finalPipeline = finalPipeline.withIccProfile(this.config.withIccProfile)
      }
      if (this.config.timeoutSeconds) {
        finalPipeline = finalPipeline.timeout({ seconds: this.config.timeoutSeconds })
      }

      await finalPipeline.toFile(this.config.path)
      return true
    } catch (error: any) {
      this.errorMessage = `保存图片失败: ${error.message}`
      this.hasError = true
      return false
    }
  }

  private validateConfig(): boolean {
    if (!this.image) {
      this.errorMessage = '图片信息未提供'
      this.hasError = true
      return false
    }

    if (!this.config || !this.config.path) {
      this.errorMessage = '输出路径未配置'
      this.hasError = true
      return false
    }

    if (this.image.hasError) {
      this.errorMessage = `原始图片有错误: ${this.image.errorMessage}`
      this.hasError = true
      return false
    }

    const supportedFormats = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'svg', 'tiff', 'avif', 'heif']
    if (!supportedFormats.includes(this.image.ext.toLowerCase())) {
      this.errorMessage = `不支持的图片格式: ${this.image.ext}`
      this.hasError = true
      return false
    }

    return true
  }

  async run(): Promise<boolean> {
    try {
      this.hasError = false
      this.errorMessage = ''
      this.hasWatermark = false
      this.hasTexture = false

      if (!this.validateConfig()) {
        return false
      }

      const pipeline = this.buildSharpPipeline()

      if (!(await this.saveImage(pipeline))) {
        return false
      }

      if (!(await this.getFileSize())) {
        return false
      }

      if (!(await this.getImageMetadata())) {
        return false
      }

      return true
    } catch (error: any) {
      this.errorMessage = `处理图片时发生未知错误: ${error.message}`
      this.hasError = true
      return false
    }
  }

  /** 获取处理结果摘要 */
  getSummary(): {
    success: boolean
    message: string
    originalSize?: number
    originalSizeFormatted?: string
    originalWidth?: number
    originalHeight?: number
    compressedSize?: number
    compressedSizeFormatted?: string
    compressedWidth?: number
    compressedHeight?: number
    compressionRatio?: number
    savedBytes?: number
    savedPercentage?: string
    path?: string
    hasWatermark?: boolean
    hasTexture?: boolean
  } {
    if (this.hasError) {
      return {
        success: false,
        message: this.errorMessage
      }
    }

    const savedBytes = this.image.size - this.size
    const savedPercentage =
      this.image.size > 0 ? `${((savedBytes / this.image.size) * 100).toFixed(2)}%` : '0%'

    return {
      success: true,
      message: '图片处理成功',
      originalSize: this.image.size,
      originalSizeFormatted: this.image.sizeFormatted,
      originalWidth: this.image.width,
      originalHeight: this.image.height,
      compressedSize: this.size,
      compressedSizeFormatted: this.sizeFormatted,
      compressedWidth: this.width,
      compressedHeight: this.height,
      compressionRatio: this.compressionRatio,
      savedBytes,
      savedPercentage,
      path: this.config.path,
      hasWatermark: this.hasWatermark,
      hasTexture: this.hasTexture
    }
  }

  /** 获取压缩统计信息 */
  getCompressionStats(): {
    original: { width: number; height: number; size: number; sizeFormatted: string }
    compressed: { width: number; height: number; size: number; sizeFormatted: string }
    ratio: number
    saved: { bytes: number; percentage: string }
    effects: {
      watermark: boolean
      texture: boolean
    }
  } {
    return {
      original: {
        width: this.image.width,
        height: this.image.height,
        size: this.image.size,
        sizeFormatted: this.image.sizeFormatted
      },
      compressed: {
        width: this.width,
        height: this.height,
        size: this.size,
        sizeFormatted: this.sizeFormatted
      },
      ratio: this.compressionRatio,
      saved: {
        bytes: this.image.size - this.size,
        percentage:
          this.image.size > 0
            ? `${(((this.image.size - this.size) / this.image.size) * 100).toFixed(2)}%`
            : '0%'
      },
      effects: {
        watermark: this.hasWatermark,
        texture: this.hasTexture
      }
    }
  }

  toString(): string {
    if (this.hasError) {
      return `ImageCompressTask: ${this.image.path} -> 错误: ${this.errorMessage}`
    }

    const savedPercentage =
      this.image.size > 0
        ? `${(((this.image.size - this.size) / this.image.size) * 100).toFixed(2)}%`
        : '0%'

    let info = `ImageCompressTask: ${this.image.width}x${this.image.height} ${this.image.sizeFormatted} -> ${this.width}x${this.height} ${this.sizeFormatted} (节省${savedPercentage})`

    if (this.hasWatermark) {
      info += ' [水印]'
    }

    if (this.hasTexture) {
      info += ' [纹理]'
    }

    return info
  }
}

/**
 * 水印和纹理预设配置
 */
export class EffectsPresets {
  /** 版权水印预设 */
  static copyrightWatermark(text: string = '© Copyright'): WatermarkConfig {
    return {
      type: 'text',
      content: {
        text,
        fontSize: 16,
        color: 'rgba(255,255,255,0.8)',
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 6,
        shadow: {
          color: 'rgba(0,0,0,0.7)',
          blur: 2,
          offsetX: 1,
          offsetY: 1
        }
      },
      position: {
        horizontal: 'right',
        vertical: 'bottom',
        offsetX: 20,
        offsetY: 20
      },
      enabled: true,
      repeat: 'single'
    }
  }

  /** 透明水印预设 */
  static transparentWatermark(text: string): WatermarkConfig {
    return {
      type: 'text',
      content: {
        text,
        fontSize: 40,
        color: 'rgba(255,255,255,0.15)',
        opacity: 0.15
      },
      position: {
        horizontal: 'center',
        vertical: 'middle',
        offsetX: 0,
        offsetY: 0
      },
      enabled: true,
      repeat: 'grid',
      spacing: 150
    }
  }

  /** Logo水印预设 */
  static logoWatermark(logoPath: string, size: number | string = 100): WatermarkConfig {
    return {
      type: 'image',
      content: {
        imagePath: logoPath,
        width: size,
        height: size,
        fit: 'contain',
        opacity: 0.8
      },
      position: {
        horizontal: 'left',
        vertical: 'top',
        offsetX: 20,
        offsetY: 20
      },
      enabled: true,
      repeat: 'single'
    }
  }

  /** 图片边框水印 */
  static borderWatermark(): WatermarkConfig[] {
    return [
      {
        type: 'text',
        content: {
          text: 'PROTECTED',
          fontSize: 12,
          color: 'rgba(255,255,255,0.7)',
          backgroundColor: 'rgba(0,0,0,0.6)',
          padding: 3
        },
        position: {
          horizontal: 'left',
          vertical: 'top',
          offsetX: 5,
          offsetY: 5
        },
        enabled: true,
        repeat: 'repeat',
        spacing: 100
      },
      {
        type: 'text',
        content: {
          text: 'CONFIDENTIAL',
          fontSize: 12,
          color: 'rgba(255,255,255,0.7)',
          backgroundColor: 'rgba(0,0,0,0.6)',
          padding: 3
        },
        position: {
          horizontal: 'right',
          vertical: 'bottom',
          offsetX: 5,
          offsetY: 5
        },
        enabled: true,
        repeat: 'repeat',
        spacing: 100
      }
    ]
  }

  /** 网格纹理预设 */
  static gridTexture(): TextureOptions {
    return {
      type: 'grid',
      color: 'rgba(0,0,0,0.1)',
      size: 20,
      lineWidth: 1,
      opacity: 0.2,
      blendMode: 'multiply'
    }
  }

  /** 点状纹理预设 */
  static dotTexture(): TextureOptions {
    return {
      type: 'dot',
      color: 'rgba(0,0,0,0.15)',
      size: 25,
      dotSize: 1,
      opacity: 0.3,
      blendMode: 'overlay'
    }
  }

  /** 纸张纹理预设 */
  static paperTexture(): TextureOptions {
    return {
      type: 'noise',
      intensity: 0.08,
      opacity: 0.4,
      blendMode: 'soft-light',
      scale: 1.2
    }
  }

  /** 布纹纹理预设 */
  static canvasTexture(): TextureOptions {
    return {
      type: 'custom',
      customImage: path.join(__dirname, 'assets/canvas-texture.png'), // 假设有纹理图片
      opacity: 0.25,
      blendMode: 'overlay',
      scale: 0.8
    }
  }

  /** 交叉线纹理预设 */
  static crossTexture(): TextureOptions {
    return {
      type: 'cross',
      color: 'rgba(100,100,100,0.2)',
      size: 15,
      lineWidth: 1,
      opacity: 0.3,
      angle: 45,
      blendMode: 'multiply'
    }
  }
}

/**
 * 水印工具函数
 */
export class WatermarkUtils {
  /**
   * 生成时间戳水印
   */
  static timestampWatermark(): WatermarkConfig {
    const now = new Date()
    const timestamp = now.toISOString().replace('T', ' ').substring(0, 19)

    return {
      type: 'text',
      content: {
        text: `生成时间: ${timestamp}`,
        fontSize: 12,
        color: 'rgba(255,255,255,0.7)',
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 4
      },
      position: {
        horizontal: 'left',
        vertical: 'bottom',
        offsetX: 10,
        offsetY: 10
      },
      enabled: true,
      repeat: 'single'
    }
  }

  /**
   * 生成文件名水印
   */
  static filenameWatermark(filename: string): WatermarkConfig {
    return {
      type: 'text',
      content: {
        text: `文件名: ${path.basename(filename, path.extname(filename))}`,
        fontSize: 12,
        color: 'rgba(200,200,200,0.8)',
        backgroundColor: 'rgba(30,30,30,0.6)',
        padding: 3
      },
      position: {
        horizontal: 'right',
        vertical: 'top',
        offsetX: 10,
        offsetY: 10
      },
      enabled: true,
      repeat: 'single'
    }
  }

  /**
   * 生成分辨率水印
   */
  static resolutionWatermark(width: number, height: number): WatermarkConfig {
    return {
      type: 'text',
      content: {
        text: `${width}×${height}`,
        fontSize: 11,
        color: 'rgba(180,180,180,0.6)',
        backgroundColor: 'rgba(40,40,40,0.4)',
        padding: 2
      },
      position: {
        horizontal: 'left',
        vertical: 'top',
        offsetX: 5,
        offsetY: 5
      },
      enabled: true,
      repeat: 'single'
    }
  }
}
