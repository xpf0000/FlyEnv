import type { FitEnum, KernelEnum, FormatEnum } from 'sharp'

/**
 * 文字水印配置
 */
export interface TextWatermarkOptions {
  /** 水印文字内容 (必填) */
  text: string
  /** 字体大小，单位像素 (默认 24) */
  fontSize?: number
  /** 字体颜色，支持颜色名称、十六进制、RGB等 (默认 '#FFFFFF') */
  color?: string
  /** 文字透明度 0-1 (默认 0.8) */
  opacity?: number
  /** 文字背景颜色 (可选) */
  backgroundColor?: string
  /** 文字内边距，单位像素 (默认 4) */
  padding?: number
  /** 文字阴影配置 (可选) */
  shadow?: {
    /** 阴影颜色 (默认 'rgba(0,0,0,0.5)') */
    color?: string
    /** 阴影模糊度 (默认 2) */
    blur?: number
    /** 阴影X偏移 (默认 1) */
    offsetX?: number
    /** 阴影Y偏移 (默认 1) */
    offsetY?: number
  }
}

/**
 * 图片水印配置
 */
export interface ImageWatermarkOptions {
  /** 水印图片路径 (必填) */
  imagePath: string
  /** 水印图片宽度 (单位像素或百分比字符串) (可选) */
  width?: number | string
  /** 水印图片高度 (单位像素或百分比字符串) (可选) */
  height?: number | string
  /** 水印图片缩放模式 (可选) */
  fit?: keyof FitEnum
  /** 水印透明度 0-1 (默认 0.7) */
  opacity?: number
  /** 水印旋转角度，单位度 (默认 0) */
  rotate?: number
}

/**
 * 水印位置配置
 */
export interface WatermarkPosition {
  /** 水平位置: 'left' | 'center' | 'right' (默认 'right') */
  horizontal?: 'left' | 'center' | 'right'
  /** 垂直位置: 'top' | 'middle' | 'bottom' (默认 'bottom') */
  vertical?: 'top' | 'middle' | 'bottom'
  /** 水平偏移，单位像素 (默认 20) */
  offsetX?: number
  /** 垂直偏移，单位像素 (默认 20) */
  offsetY?: number
}

/**
 * 完整的水印配置
 */
export interface WatermarkConfig {
  /** 水印类型: 'text' 或 'image' (必填) */
  type: 'text' | 'image'
  /** 水印内容配置 (必填) */
  content: TextWatermarkOptions | ImageWatermarkOptions
  /** 水印位置配置 (可选) */
  position?: WatermarkPosition
  /** 是否启用水印 (默认 false) */
  enabled?: boolean
  /** 水印重复模式: 'single' | 'repeat' | 'grid' (默认 'single') */
  repeat?: 'single' | 'repeat' | 'grid'
  /** 网格模式下的间距，单位像素 (默认 100) */
  spacing?: number
}

/**
 * 栅格纹理配置
 */
export interface TextureOptions {
  /** 是否启用栅格纹理 (默认 false) */
  enabled?: boolean
  /** 纹理类型 (必填) */
  type: 'grid' | 'dot' | 'line' | 'cross' | 'noise' | 'custom'
  /** 纹理颜色 (默认 'rgba(255,255,255,0.1)') */
  color?: string
  /** 纹理大小/间距，单位像素 (默认 20) */
  size?: number
  /** 线条宽度 (仅适用于 line/cross 类型) (默认 1) */
  lineWidth?: number
  /** 点的大小 (仅适用于 dot 类型) (默认 2) */
  dotSize?: number
  /** 噪点强度 0-1 (仅适用于 noise 类型) (默认 0.05) */
  intensity?: number
  /** 自定义纹理图片路径 (仅适用于 custom 类型) */
  customImage?: string
  /** 纹理混合模式 (默认 'overlay') */
  blendMode?: 'overlay' | 'multiply' | 'screen' | 'soft-light' | 'hard-light'
  /** 纹理透明度 0-1 (默认 0.3) */
  opacity?: number
  /** 纹理角度，单位度 (默认 0) */
  angle?: number
  /** 纹理缩放比例 0.1-5 (默认 1) */
  scale?: number
}

/**
 * 扩展的 Sharp 配置类型
 */
export type SharpConfig = {
  // ====================== 基本配置 ======================

  /** 图片保存路径 (必填) */
  path: string

  /** 输出图片宽度，单位像素 (可选) */
  width?: number

  /** 输出图片高度，单位像素 (可选) */
  height?: number

  /** 图片缩放模式 (可选) */
  fit?: keyof FitEnum

  /** 裁剪焦点位置 (可选) */
  position?: number | string

  /** 重采样内核 (可选) */
  kernel?: keyof KernelEnum

  /** 禁止放大图片 (默认 false) */
  withoutEnlargement?: boolean

  /** 禁止缩小图片 (默认 false) */
  withoutReduction?: boolean

  /** 快速缩小加载优化 (默认 true) */
  fastShrinkOnLoad?: boolean

  /** 输出图片格式 (默认 'jpeg') */
  format?: 'none' | keyof FormatEnum

  compressOpen?: boolean

  // ====================== 裁剪配置 ======================

  /** 是否启用去白边/透明边 (默认 false) */
  trim?: boolean

  // ====================== 水印配置 ======================

  /** 水印配置，支持单个或多个水印 (可选) */
  watermark?: WatermarkConfig | WatermarkConfig[]

  // ====================== 纹理配置 ======================

  /** 栅格纹理配置 (可选) */
  texture?: TextureOptions

  // ====================== 各格式压缩配置 ======================

  /** JPEG 格式特定配置 (可选) */
  jpeg?: {
    /** 图片质量 0-100 (默认 80) */
    quality?: number
    /** 是否启用渐进式加载 (默认 true) */
    progressive?: boolean
    /** 色彩采样方式 (默认 '4:2:0') */
    chromaSubsampling?: '4:2:0' | '4:4:4' | '4:2:2'
    /** 是否优化编码 (默认 true) */
    optimiseCoding?: boolean
    /** 使用 MozJPEG 编码器 (默认 false) */
    mozjpeg?: boolean
    /** 是否启用格状量化 (默认 false) */
    trellisQuantisation?: boolean
    /** 是否优化扫描 (默认 false) */
    optimiseScans?: boolean
  }

  /** PNG 格式特定配置 (可选) */
  png?: {
    /** 图片质量 0-100 (默认 80) */
    quality?: number
    /** 是否启用渐进式加载 (默认 false) */
    progressive?: boolean
    /** 压缩级别 0-9 (默认 6) */
    compressionLevel?: number
    /** 是否启用自适应过滤 (默认 false) */
    adaptiveFiltering?: boolean
    /** 是否使用调色板 (默认 false) */
    palette?: boolean
    /** 调色板颜色数量 (默认 256) */
    colours?: number
    /** 抖动强度 0-1 (可选) */
    dither?: number
  }

  /** WebP 格式特定配置 (可选) */
  webp?: {
    /** 图片质量 0-100 (默认 80) */
    quality?: number
    /** 透明度质量 0-100 (默认 100) */
    alphaQuality?: number
    /** 是否使用无损压缩 (默认 false) */
    lossless?: boolean
    /** 是否启用近无损压缩 (默认 false) */
    nearLossless?: boolean
    /** 是否启用智能二次采样 (默认 true) */
    smartSubsample?: boolean
    /** 压缩强度 0-6 (默认 4) */
    effort?: number
  }

  /** AVIF 格式特定配置 (可选) */
  avif?: {
    /** 图片质量 0-100 (默认 50) */
    quality?: number
    /** 是否使用无损压缩 (默认 false) */
    lossless?: boolean
    /** 压缩强度 0-9 (默认 4) */
    effort?: number
    /** 色彩采样方式 (默认 '4:2:0') */
    chromaSubsampling?: '4:2:0' | '4:4:4'
  }

  /** GIF 格式特定配置 (可选) */
  gif?: {
    /** 每页高度 (可选) */
    pageHeight?: number
    /** 循环次数，0为无限循环 (默认 0) */
    loop?: number
    /** 每帧延迟时间数组，单位毫秒 (默认 [100]) */
    delay?: number[]
    /** 压缩强度 1-10 (默认 7) */
    effort?: number
  }

  /** TIFF 格式特定配置 (可选) */
  tiff?: {
    /** 图片质量 0-100 (默认 80) */
    quality?: number
    /** 压缩算法 (默认 'jpeg') */
    compression?: 'jpeg' | 'deflate' | 'ccittfax4' | 'lzw' | 'packbits' | 'webp' | 'zstd'
    /** 预测器类型 (可选) */
    predictor?: 'none' | 'horizontal' | 'float'
    /** 是否启用金字塔结构 (默认 false) */
    pyramid?: boolean
    /** 是否启用分块 (默认 false) */
    tile?: boolean
    /** 分块宽度 (默认 256) */
    tileWidth?: number
    /** 分块高度 (默认 256) */
    tileHeight?: number
    /** 水平分辨率，单位DPI (可选) */
    xres?: number
    /** 垂直分辨率，单位DPI (可选) */
    yres?: number
  }

  /** HEIF 格式特定配置 (可选) */
  heif?: {
    /** 图片质量 0-100 (默认 50) */
    quality?: number
    /** 压缩算法 (默认 'hevc') */
    compression?: 'av1' | 'hevc'
    /** 是否使用无损压缩 (默认 false) */
    lossless?: boolean
    /** 压缩强度 0-9 (默认 4) */
    effort?: number
    /** 色彩采样方式 (默认 '4:2:0') */
    chromaSubsampling?: '4:2:0' | '4:4:4'
  }

  // ====================== 性能配置 ======================

  /** 处理超时时间，单位秒 (默认 30) */
  timeoutSeconds?: number

  // ====================== 元数据配置 ======================

  /** 是否保留元数据 (默认 false) */
  withMetadata?: boolean

  /** ICC 配置文件名称 (可选) */
  withIccProfile?: string

  // ====================== 变换操作 ======================

  /** 旋转角度，单位度 (默认 0) */
  rotate?: number

  /** 是否垂直翻转 (默认 false) */
  flip?: boolean

  /** 是否水平翻转 (默认 false) */
  flop?: boolean

  /** 模糊半径，单位像素 (默认 0) */
  blur?: number

  /** 锐化配置 (可选) */
  sharpen?: {
    /** 锐化强度 (必填) */
    sigma: number
    /** 平面1的平坦区域 (可选) */
    m1?: number
    /** 平面2的平坦区域 (可选) */
    m2?: number
    /** 平面1的锐化阈值 (可选) */
    x1?: number
    /** 平面2的锐化阈值 (可选) */
    y2?: number
    /** 平面3的锐化阈值 (可选) */
    y3?: number
  }

  /** Gamma 校正值 (默认 2.2) */
  gamma?: number

  /** 是否转换为灰度图 (默认 false) */
  grayscale?: boolean

  /** 是否标准化像素值 (默认 false) */
  normalise?: boolean

  /** CLAHE 对比度限制自适应直方图均衡化配置 (可选) */
  clahe?: {
    /** 网格宽度 (必填) */
    width: number
    /** 网格高度 (必填) */
    height: number
    /** 最大斜率限制 (可选) */
    maxSlope?: number
  }

  /** 是否反相颜色 (默认 false) */
  negate?: boolean

  /** 中值滤波半径 (默认 0) */
  median?: number

  /** 线性调整配置 (可选) */
  linear?: {
    /** 乘数因子 (必填) */
    a: number
    /** 加数因子 (必填) */
    b: number
  }

  /** 颜色调制配置 (可选) */
  modulate?: {
    /** 亮度调节 0-3 (默认 1) */
    brightness?: number
    /** 饱和度调节 0-3 (默认 1) */
    saturation?: number
    /** 色相调节 -180-180 (默认 0) */
    hue?: number
    /** 明度调节 (可选) */
    lightness?: number
  }

  /** 二值化阈值 0-255 (默认 128) */
  threshold?: number

  /** 目标色彩空间 (默认 'srgb') */
  toColorspace?: 'srgb' | 'rgb' | 'cmyk' | 'lab' | 'b-w'

  /** 是否移除Alpha通道 (默认 false) */
  removeAlpha?: boolean

  /** 确保Alpha通道存在 (可选) */
  ensureAlpha?: number

  /** 颜色着色配置 (可选) */
  tint?: {
    /** 红色分量 0-255 (必填) */
    r: number
    /** 绿色分量 0-255 (必填) */
    g: number
    /** 蓝色分量 0-255 (必填) */
    b: number
  }

  /** 扩展画布配置 (可选) */
  extend?: {
    /** 顶部扩展像素 (可选) */
    top?: number
    /** 底部扩展像素 (可选) */
    bottom?: number
    /** 左侧扩展像素 (可选) */
    left?: number
    /** 右侧扩展像素 (可选) */
    right?: number
    /** 扩展区域背景色 (默认 '#000000') */
    background?: string
  }

  /** 裁剪区域配置 (可选) */
  extract?: {
    /** 裁剪区域左侧坐标 (必填) */
    left: number
    /** 裁剪区域顶部坐标 (必填) */
    top: number
    /** 裁剪区域宽度 (必填) */
    width: number
    /** 裁剪区域高度 (必填) */
    height: number
  }
}

// 文件大小信息类型
export interface FileSizeInfo {
  /** 字节数 */
  bytes: number
  /** 千字节数（保留2位小数） */
  kilobytes: number
  /** 兆字节数（保留4位小数） */
  megabytes: number
}

export interface ImageInfo {
  base64: string
  size: FileSizeInfo
  dimensions: {
    width: number
    height: number
  }
  format: string
}

export interface CompressionInfo {
  // 压缩比例
  ratio: number
  // 压缩减少的大小
  sizeReduced: {
    bytes: number
    kilobytes: number
    megabytes: number
  }
  // 是否变小
  isReduced: boolean
}

export interface CompressTestResult {
  // 压缩前的原始图片
  original: ImageInfo
  // 压缩后的图片
  compressed: ImageInfo
  // 压缩信息
  compression: CompressionInfo
}

export interface EffectsTestResult {
  // 原始图片
  original: {
    base64: string
  }
  // 应用效果后的图片
  effected: {
    base64: string
  }
}
